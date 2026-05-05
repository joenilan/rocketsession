use serde_json::{json, Map, Value};
use std::collections::HashMap;

#[derive(Clone, Debug)]
struct PlayerIdentity {
    id: String,
    shortcut: Option<i64>,
}

#[derive(Default)]
pub struct StatsApiAdapter {
    players_by_shortcut_team: HashMap<(i64, i64), PlayerIdentity>,
    players_by_name_team: HashMap<(String, i64), PlayerIdentity>,
}

impl StatsApiAdapter {
    pub fn normalize_message(&mut self, text: &str) -> Option<String> {
        let envelope: Value = serde_json::from_str(text).ok()?;
        let event_name = envelope.get("Event")?.as_str()?;
        // Rocket League's MatchStatsExporter wraps event payloads as a JSON-encoded
        // string in `Data`. Parse it back into a Value before mapping. Older fixtures
        // (and some events with primitive payloads) may already provide an object.
        let data = match envelope.get("Data") {
            Some(Value::String(raw)) => {
                serde_json::from_str::<Value>(raw).unwrap_or(Value::String(raw.clone()))
            }
            Some(other) => other.clone(),
            None => Value::Null,
        };

        let (event, data) = match event_name {
            "UpdateState" => {
                self.refresh_player_cache(&data);
                ("game:update_state", self.map_update_state(&data))
            }
            "GoalScored" => ("game:goal_scored", self.map_goal_scored(&data)),
            "MatchEnded" => ("game:match_ended", self.map_match_ended(&data)),
            "StatfeedEvent" => ("game:statfeed_event", self.map_statfeed_event(&data)),
            "MatchCreated" => ("game:match_created", data),
            "MatchInitialized" => ("game:initialized", data),
            "MatchDestroyed" => ("game:match_destroyed", data),
            "CountdownBegin" => ("game:pre_countdown_begin", data),
            "RoundStarted" => ("game:round_started_go", data),
            "GoalReplayStart" => ("game:replay_start", data),
            "GoalReplayWillEnd" => ("game:replay_will_end", data),
            "GoalReplayEnd" => ("game:replay_end", data),
            "PodiumStart" => ("game:podium_start", data),
            "BallHit" => ("game:ball_hit", data),
            "ClockUpdatedSeconds" => ("game:clock_updated_seconds", data),
            "ReplayCreated" => ("game:replay_created", data),
            "MatchPaused" => ("game:match_paused", data),
            "MatchUnpaused" => ("game:match_unpaused", data),
            "CrossbarHit" => ("game:crossbar_hit", data),
            _ => return None,
        };

        serde_json::to_string(&json!({
            "event": event,
            "data": data,
            "source": "rocketLeagueStatsApi",
        }))
        .ok()
    }

    fn refresh_player_cache(&mut self, data: &Value) {
        self.players_by_shortcut_team.clear();
        self.players_by_name_team.clear();

        for player in data
            .get("Players")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let team_num = number_field(player, "TeamNum").unwrap_or(-1);
            if team_num < 0 {
                continue;
            }
            let name = string_field(player, "Name").unwrap_or_default();
            let identity = PlayerIdentity {
                id: effective_player_id(player),
                shortcut: number_field(player, "Shortcut"),
            };

            if let Some(shortcut) = identity.shortcut {
                self.players_by_shortcut_team
                    .insert((shortcut, team_num), identity.clone());
            }
            self.players_by_name_team
                .insert((normalize_name(&name), team_num), identity);
        }
    }

    fn map_update_state(&self, data: &Value) -> Value {
        let mut players = Map::new();
        for player in data
            .get("Players")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let id = effective_player_id(player);

            players.insert(
                id.clone(),
                json!({
                    "id": id,
                    "name": string_field(player, "Name").unwrap_or_default(),
                    "team": number_field(player, "TeamNum").unwrap_or(-1),
                    "boost": number_field(player, "Boost").unwrap_or(0),
                    "boost_is_reliable": player.get("Boost").is_some(),
                    "score": number_field(player, "Score").unwrap_or(0),
                    "goals": number_field(player, "Goals").unwrap_or(0),
                    "saves": number_field(player, "Saves").unwrap_or(0),
                    "shots": number_field(player, "Shots").unwrap_or(0),
                    "demos": number_field(player, "Demos").unwrap_or(0),
                    "assists": number_field(player, "Assists").unwrap_or(0),
                    "touches": number_field(player, "Touches").unwrap_or(0),
                    "carTouches": number_field(player, "CarTouches").unwrap_or(0),
                    "hasCar": bool_field(player, "bHasCar"),
                    "isSonic": bool_field(player, "bSupersonic"),
                    "isDead": bool_field(player, "bDemolished"),
                    "speed": number_field(player, "Speed"),
                    "isBoosting": bool_field(player, "bBoosting"),
                    "isOnGround": bool_field(player, "bOnGround"),
                    "isOnWall": bool_field(player, "bOnWall"),
                    "isPowersliding": bool_field(player, "bPowersliding"),
                }),
            );
        }

        let game = data.get("Game").unwrap_or(&Value::Null);
        json!({
            "players": Value::Object(players),
            "game": {
                "time_seconds": number_field(game, "TimeSeconds").unwrap_or(0),
                "isOT": bool_field(game, "bOvertime").unwrap_or(false),
                "target": game
                    .get("Target")
                    .and_then(|target| self.resolve_target_id(target)),
                "status": status_from_game(game),
                "teams": map_teams(game.get("Teams")),
                "ball": {
                    "speed": game.get("Ball").and_then(|ball| number_field(ball, "Speed")),
                    "team": game.get("Ball").and_then(|ball| number_field(ball, "TeamNum")),
                },
                "isReplay": bool_field(game, "bReplay").unwrap_or(false),
                "winner": string_field(game, "Winner").unwrap_or_default(),
                "arena": string_field(game, "Arena").unwrap_or_default(),
                "frame": number_field(game, "Frame"),
                "elapsed": number_field(game, "Elapsed"),
            }
        })
    }

    fn map_goal_scored(&self, data: &Value) -> Value {
        let scorer = data.get("Scorer");
        let scoring_team = scorer
            .and_then(|target| number_field(target, "TeamNum"))
            .unwrap_or(-1);

        json!({
            "scoring_team": scoring_team,
            "goal_speed": number_field(data, "GoalSpeed"),
            "goal_time": number_field(data, "GoalTime"),
            "scorer": scorer.map(|target| self.map_target(target)),
            "assister": data.get("Assister").map(|target| self.map_target(target)),
            "ball_last_touch": data.get("BallLastTouch"),
            "impact_location": data.get("ImpactLocation"),
            "raw": data,
        })
    }

    fn map_match_ended(&self, data: &Value) -> Value {
        json!({
            "winner_team_num": number_field(data, "WinnerTeamNum").unwrap_or(-1),
            "raw": data,
        })
    }

    fn map_statfeed_event(&self, data: &Value) -> Value {
        json!({
            "event_name": string_field(data, "EventName").unwrap_or_default(),
            "type": string_field(data, "Type").unwrap_or_default(),
            "main_target": data
                .get("MainTarget")
                .map(|target| self.map_target(target))
                .unwrap_or_else(|| empty_target()),
            "secondary_target": data
                .get("SecondaryTarget")
                .map(|target| self.map_target(target))
                .unwrap_or_else(|| empty_target()),
            "raw": data,
        })
    }

    fn map_target(&self, target: &Value) -> Value {
        let id = self.resolve_target_id(target).unwrap_or_default();
        json!({
            "id": id,
            "name": string_field(target, "Name").unwrap_or_default(),
            "team_num": number_field(target, "TeamNum").unwrap_or(-1),
            "shortcut": number_field(target, "Shortcut"),
        })
    }

    fn resolve_target_id(&self, target: &Value) -> Option<String> {
        if let Some(id) = string_field(target, "PrimaryId")
            .filter(|value| !value.is_empty() && !is_stub_primary_id(value))
        {
            return Some(id);
        }

        let team_num = number_field(target, "TeamNum")?;
        if let Some(shortcut) = number_field(target, "Shortcut") {
            if let Some(identity) = self.players_by_shortcut_team.get(&(shortcut, team_num)) {
                return Some(identity.id.clone());
            }
        }

        let name = string_field(target, "Name")?;
        self.players_by_name_team
            .get(&(normalize_name(&name), team_num))
            .map(|identity| identity.id.clone())
    }
}

fn map_teams(value: Option<&Value>) -> Value {
    let mut teams = vec![
        json!({
            "name": "Blue",
            "score": 0,
            "color_primary": "#0074ff",
            "color_secondary": "#ffffff",
        }),
        json!({
            "name": "Orange",
            "score": 0,
            "color_primary": "#ff8b00",
            "color_secondary": "#ffffff",
        }),
    ];

    for team in value.and_then(Value::as_array).into_iter().flatten() {
        let idx = number_field(team, "TeamNum").unwrap_or(-1);
        if !(0..=1).contains(&idx) {
            continue;
        }
        teams[idx as usize] = json!({
            "name": string_field(team, "Name").unwrap_or_else(|| if idx == 0 { "Blue".to_string() } else { "Orange".to_string() }),
            "score": number_field(team, "Score").unwrap_or(0),
            "color_primary": normalize_color_field(team, "ColorPrimary", if idx == 0 { "#0074ff" } else { "#ff8b00" }),
            "color_secondary": normalize_color_field(team, "ColorSecondary", "#ffffff"),
        });
    }

    Value::Array(teams)
}

fn empty_target() -> Value {
    json!({
        "id": "",
        "name": "",
        "team_num": -1,
    })
}

fn status_from_game(game: &Value) -> String {
    if bool_field(game, "bReplay").unwrap_or(false) {
        "replay".to_string()
    } else if bool_field(game, "bHasWinner").unwrap_or(false) {
        "post_match".to_string()
    } else {
        "in_game".to_string()
    }
}

fn synthetic_player_id(player: &Value) -> String {
    let name = string_field(player, "Name").unwrap_or_else(|| "unknown".to_string());
    let team = number_field(player, "TeamNum").unwrap_or(-1);
    let shortcut = number_field(player, "Shortcut").unwrap_or(-1);
    format!("statsapi:{team}:{shortcut}:{}", normalize_name(&name))
}

/// Returns the id we use to key a player in the relay payload.
///
/// Bot matches and some non-platform clients populate `PrimaryId` with
/// `Unknown|0|0` (or similar Unknown-prefixed stubs), which collide across
/// every player in the lobby. Treat those as missing and fall back to a
/// synthetic id derived from `(TeamNum, Shortcut, Name)` — the Stats API
/// guarantees `Shortcut` is unique per match, so this stays stable across
/// `UpdateState` ticks while preserving uniqueness.
fn effective_player_id(player: &Value) -> String {
    let primary = string_field(player, "PrimaryId").unwrap_or_default();
    if !primary.is_empty() && !is_stub_primary_id(&primary) {
        return primary;
    }
    synthetic_player_id(player)
}

fn is_stub_primary_id(value: &str) -> bool {
    value.starts_with("Unknown|")
}

fn normalize_color_field(value: &Value, key: &str, fallback: &str) -> String {
    let Some(raw) = string_field(value, key) else {
        return fallback.to_string();
    };
    let trimmed = raw.trim().trim_start_matches('#');
    if trimmed.len() == 6 && trimmed.chars().all(|ch| ch.is_ascii_hexdigit()) {
        format!("#{trimmed}")
    } else {
        fallback.to_string()
    }
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key)?.as_str().map(ToString::to_string)
}

fn number_field(value: &Value, key: &str) -> Option<i64> {
    value.get(key)?.as_i64().or_else(|| {
        value
            .get(key)?
            .as_f64()
            .filter(|value| value.is_finite())
            .map(|value| value.round() as i64)
    })
}

fn bool_field(value: &Value, key: &str) -> Option<bool> {
    value.get(key)?.as_bool()
}

fn normalize_name(value: &str) -> String {
    value.trim().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn normalize(adapter: &mut StatsApiAdapter, value: Value) -> Value {
        let text = serde_json::to_string(&value).expect("sample should serialize");
        let normalized = adapter
            .normalize_message(&text)
            .expect("sample should normalize");
        serde_json::from_str(&normalized).expect("normalized sample should parse")
    }

    fn normalize_wire(adapter: &mut StatsApiAdapter, event: &str, data: Value) -> Value {
        let envelope = json!({
            "Event": event,
            "Data": serde_json::to_string(&data).expect("data should serialize"),
        });
        normalize(adapter, envelope)
    }

    #[test]
    fn bot_match_with_shared_primary_id_does_not_collapse_into_one_player() {
        // Real-world payload from a 4v4 bot match: every bot reports
        // `PrimaryId: "Unknown|0|0"`, so keying the players map by PrimaryId
        // would lose 7 of the 8 entries. The adapter must synthesize stable
        // per-player ids in this case.
        let mut adapter = StatsApiAdapter::default();
        let bot = |name: &str, team: i64, shortcut: i64| {
            json!({
                "Name": name,
                "PrimaryId": "Unknown|0|0",
                "Shortcut": shortcut,
                "TeamNum": team,
                "bHasCar": true,
            })
        };

        let output = normalize(
            &mut adapter,
            json!({
                "Event": "UpdateState",
                "Data": {
                    "Players": [
                        bot("Merlin", 0, 1),
                        bot("Casper", 1, 5),
                        bot("Scout", 0, 2),
                        bot("Sundown", 1, 6),
                        bot("Rex", 1, 7),
                        bot("Foamer", 0, 3),
                        bot("Hollywood", 0, 4),
                        bot("Jester", 1, 8),
                    ],
                    "Game": {}
                }
            }),
        );

        let players = output["data"]["players"]
            .as_object()
            .expect("players should be an object");
        assert_eq!(players.len(), 8, "all 8 bots should be present");
        let names: std::collections::HashSet<&str> = players
            .values()
            .filter_map(|p| p["name"].as_str())
            .collect();
        for expected in [
            "Merlin",
            "Casper",
            "Scout",
            "Sundown",
            "Rex",
            "Foamer",
            "Hollywood",
            "Jester",
        ] {
            assert!(names.contains(expected), "missing bot {expected}");
        }
    }

    #[test]
    fn target_resolves_to_synthetic_id_for_bots() {
        let mut adapter = StatsApiAdapter::default();
        let output = normalize(
            &mut adapter,
            json!({
                "Event": "UpdateState",
                "Data": {
                    "Players": [
                        {
                            "Name": "Merlin",
                            "PrimaryId": "Unknown|0|0",
                            "Shortcut": 1,
                            "TeamNum": 0,
                            "bHasCar": true,
                        },
                        {
                            "Name": "Jester",
                            "PrimaryId": "Unknown|0|0",
                            "Shortcut": 8,
                            "TeamNum": 1,
                            "bHasCar": true,
                        }
                    ],
                    "Game": {
                        "bHasTarget": true,
                        "Target": {
                            "Name": "Merlin",
                            "Shortcut": 1,
                            "TeamNum": 0
                        }
                    }
                }
            }),
        );

        let target = output["data"]["game"]["target"]
            .as_str()
            .expect("target should be set when spectator focus is active")
            .to_string();
        assert!(
            output["data"]["players"].get(&target).is_some(),
            "target id {target} should index into the players map"
        );
        assert_eq!(
            output["data"]["players"][&target]["name"], "Merlin",
            "target should resolve to Merlin (the focused bot)"
        );
    }

    #[test]
    fn parses_data_when_envelope_uses_string_payload() {
        let mut adapter = StatsApiAdapter::default();
        let output = normalize_wire(
            &mut adapter,
            "UpdateState",
            json!({
                "Players": [
                    {
                        "Name": "Casper",
                        "PrimaryId": "Steam|999|0",
                        "Shortcut": 5,
                        "TeamNum": 1,
                        "Boost": 33,
                    }
                ],
                "Game": { "TimeSeconds": 60 },
            }),
        );
        assert_eq!(output["event"], "game:update_state");
        assert_eq!(output["data"]["players"]["Steam|999|0"]["boost"], 33);
        assert_eq!(output["data"]["game"]["time_seconds"], 60);
    }

    #[test]
    fn maps_update_state_to_boost_overlay_contract() {
        let mut adapter = StatsApiAdapter::default();
        let output = normalize(
            &mut adapter,
            json!({
                "Event": "UpdateState",
                "Data": {
                    "Players": [
                        {
                            "Name": "PlayerA",
                            "PrimaryId": "Steam|123|0",
                            "Shortcut": 1,
                            "TeamNum": 0,
                            "Score": 125,
                            "Goals": 1,
                            "Shots": 2,
                            "Assists": 0,
                            "Saves": 1,
                            "Touches": 14,
                            "CarTouches": 3,
                            "Demos": 0,
                            "bHasCar": true,
                            "Speed": 1200,
                            "Boost": 45,
                            "bBoosting": true,
                            "bOnGround": true,
                            "bOnWall": false,
                            "bPowersliding": false,
                            "bDemolished": false,
                            "bSupersonic": true
                        }
                    ],
                    "Game": {
                        "Teams": [
                            {
                                "Name": "Blue",
                                "TeamNum": 0,
                                "Score": 1,
                                "ColorPrimary": "0000FF",
                                "ColorSecondary": "0000AA"
                            },
                            {
                                "Name": "Orange",
                                "TeamNum": 1,
                                "Score": 0,
                                "ColorPrimary": "FF8800",
                                "ColorSecondary": "222222"
                            }
                        ],
                        "TimeSeconds": 180,
                        "bOvertime": false,
                        "Ball": {
                            "Speed": 850.5,
                            "TeamNum": 0
                        },
                        "bReplay": false,
                        "bHasWinner": false,
                        "Winner": "",
                        "Arena": "Stadium_P",
                        "bHasTarget": true,
                        "Target": {
                            "Name": "PlayerA",
                            "Shortcut": 1,
                            "TeamNum": 0
                        }
                    }
                }
            }),
        );

        assert_eq!(output["event"], "game:update_state");
        assert_eq!(output["data"]["players"]["Steam|123|0"]["name"], "PlayerA");
        assert_eq!(output["data"]["players"]["Steam|123|0"]["boost"], 45);
        assert_eq!(output["data"]["players"]["Steam|123|0"]["isSonic"], true);
        assert_eq!(output["data"]["game"]["target"], "Steam|123|0");
        assert_eq!(
            output["data"]["game"]["teams"][0]["color_primary"],
            "#0000FF"
        );
        assert_eq!(output["data"]["game"]["teams"][1]["score"], 0);
    }

    #[test]
    fn resolves_statfeed_targets_from_latest_update_state() {
        let mut adapter = StatsApiAdapter::default();
        let _ = normalize(
            &mut adapter,
            json!({
                "Event": "UpdateState",
                "Data": {
                    "Players": [
                        {
                            "Name": "PlayerA",
                            "PrimaryId": "Steam|123|0",
                            "Shortcut": 1,
                            "TeamNum": 0
                        },
                        {
                            "Name": "PlayerB",
                            "PrimaryId": "Epic|456|0",
                            "Shortcut": 2,
                            "TeamNum": 1
                        }
                    ],
                    "Game": {}
                }
            }),
        );

        let output = normalize(
            &mut adapter,
            json!({
                "Event": "StatfeedEvent",
                "Data": {
                    "EventName": "Demolish",
                    "Type": "Demolition",
                    "MainTarget": {
                        "Name": "PlayerA",
                        "Shortcut": 1,
                        "TeamNum": 0
                    },
                    "SecondaryTarget": {
                        "Name": "PlayerB",
                        "Shortcut": 2,
                        "TeamNum": 1
                    }
                }
            }),
        );

        assert_eq!(output["event"], "game:statfeed_event");
        assert_eq!(output["data"]["main_target"]["id"], "Steam|123|0");
        assert_eq!(output["data"]["secondary_target"]["id"], "Epic|456|0");
    }

    #[test]
    fn maps_goal_and_match_end_events() {
        let mut adapter = StatsApiAdapter::default();
        let goal = normalize(
            &mut adapter,
            json!({
                "Event": "GoalScored",
                "Data": {
                    "GoalSpeed": 87.3,
                    "Scorer": {
                        "Name": "PlayerA",
                        "Shortcut": 1,
                        "TeamNum": 0
                    }
                }
            }),
        );
        let ended = normalize(
            &mut adapter,
            json!({
                "Event": "MatchEnded",
                "Data": {
                    "WinnerTeamNum": 1
                }
            }),
        );

        assert_eq!(goal["event"], "game:goal_scored");
        assert_eq!(goal["data"]["scoring_team"], 0);
        assert_eq!(ended["event"], "game:match_ended");
        assert_eq!(ended["data"]["winner_team_num"], 1);
    }
}
