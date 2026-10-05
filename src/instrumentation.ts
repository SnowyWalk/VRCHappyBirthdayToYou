export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const state = globalThis as typeof globalThis & {
      __birthdayStorageCleanupStarted?: boolean;
    };
    if (state.__birthdayStorageCleanupStarted) {
      return;
    }
    state.__birthdayStorageCleanupStarted = true;

    const { cleanupExpiredStorage } = await import("./lib/storage");
    const sweep = async () => {
      try {
        const result = await cleanupExpiredStorage();
        if (result.albumsDeleted || result.atlasesDeleted) {
          console.info("Expired birthday data removed:", result);
        }
      } catch (error) {
        console.error("Birthday storage cleanup failed:", error);
      }
    };
    await sweep();
    setInterval(() => { void sweep(); }, 60_000).unref();
  }
}
