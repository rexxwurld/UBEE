using System.Text.Json;
using UBee.App.Models;
namespace UBee.App.Services;
public sealed class BeneficiaryService : IBeneficiaryService
{
    private readonly string _path = Path.Combine(FileSystem.AppDataDirectory, "beneficiaries.json");
    private readonly SemaphoreSlim _gate = new(1, 1);
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    public async Task<IReadOnlyList<BeneficiaryDto>> GetAllAsync()
    {
        await _gate.WaitAsync();
        try { return await ReadAsync(); } finally { _gate.Release(); }
    }
    public async Task AddAsync(BeneficiaryDto item)
    {
        await _gate.WaitAsync();
        try { var all = await ReadAsync(); all.Add(item); await WriteAsync(all); } finally { _gate.Release(); }
    }
    public async Task RemoveAsync(string id)
    {
        await _gate.WaitAsync();
        try { var all = await ReadAsync(); all.RemoveAll(x => x.Id == id); await WriteAsync(all); } finally { _gate.Release(); }
    }
    private async Task<List<BeneficiaryDto>> ReadAsync()
    {
        if (!File.Exists(_path)) return [];
        try { return JsonSerializer.Deserialize<List<BeneficiaryDto>>(await File.ReadAllTextAsync(_path), Options) ?? []; } catch { return []; }
    }
    private Task WriteAsync(List<BeneficiaryDto> items) => File.WriteAllTextAsync(_path, JsonSerializer.Serialize(items, Options));
}
