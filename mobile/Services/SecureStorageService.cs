namespace UBee.App.Services;

public sealed class SecureStorageService : ISecureStorageService
{
    public Task SetAsync(string key, string value) => SecureStorage.Default.SetAsync(key, value);

    public async Task<string?> GetAsync(string key)
    {
        try { return await SecureStorage.Default.GetAsync(key); }
        catch { try { SecureStorage.Default.Remove(key); } catch { } return null; }
    }

    public void Remove(string key) => SecureStorage.Default.Remove(key);
}
