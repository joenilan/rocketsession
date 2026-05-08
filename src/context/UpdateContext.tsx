import { createContext, useContext, useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "../lib/api";

export type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error";

interface UpdateContextType {
  status: UpdateStatus;
  version: string | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);
const BACKGROUND_UPDATE_CHECK_MS = 30 * 60 * 1000;

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateObject, setUpdateObject] = useState<Awaited<ReturnType<typeof check>> | null>(null);

  async function runUpdateCheck(showChecking: boolean) {
    if (!isTauri) return;

    if (showChecking) setStatus("checking");
    setError(null);

    try {
      const update = await check();
      if (update?.available) {
        setUpdateObject(update);
        setVersion(update.version);
        setStatus("available");
      } else {
        setUpdateObject(null);
        setVersion(null);
        setStatus("up-to-date");
      }
    } catch (err) {
      if (showChecking) {
        setError(String(err));
        setStatus("error");
      }
    }
  }

  async function checkForUpdates() {
    await runUpdateCheck(true);
  }

  async function installUpdate() {
    if (!updateObject) return;

    setStatus("downloading");
    setError(null);

    try {
      await updateObject.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  useEffect(() => {
    if (!isTauri) return;

    void runUpdateCheck(false);

    const timer = window.setInterval(() => {
      void runUpdateCheck(false);
    }, BACKGROUND_UPDATE_CHECK_MS);

    const handleFocus = () => {
      void runUpdateCheck(false);
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return (
    <UpdateContext.Provider value={{ status, version, error, checkForUpdates, installUpdate }}>
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdateStatus() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdateStatus must be used within UpdateProvider");
  return ctx;
}
