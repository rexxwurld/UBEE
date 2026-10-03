using UBee.App.Services.Logging;

namespace UBee.App.Services;

public sealed class SecureStorageService : ISecureStorageService
{
    public Task SetAsync(string key, string value) => SecureStorage.Default.SetAsync(key, value);

    public async Task<string?> GetAsync(string key)
    {
        try { return await SecureStorage.Default.GetAsync(key); }
        catch (Exception ex)
        {
            // Only the key NAME is logged, never the stored value.
            CrashLogger.Warning("SecureStorage read failed; entry cleared", ex, new Dictionary<string, string?> { ["Storage key name"] = key });
            try { SecureStorage.Default.Remove(key); } catch { }
            return null;
        }
    }

    public void Remove(string key) => SecureStorage.Default.Remove(key);
}
