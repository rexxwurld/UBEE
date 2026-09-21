using System.Reflection;
using System.Text.Json;

namespace UBee.App.Services;

public sealed class AppConfiguration : IAppConfiguration
{
    public string ApiBaseUrl { get; }
    public AppConfiguration()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("UBee.App.appsettings.json")
            ?? throw new InvalidOperationException("appsettings.json was not embedded.");
        using var reader = new StreamReader(stream);
        using var doc = JsonDocument.Parse(reader.ReadToEnd());
        ApiBaseUrl = doc.RootElement.GetProperty("Api").GetProperty("BaseUrl").GetString() ?? throw new InvalidOperationException("Api:BaseUrl is missing.");
        if (!ApiBaseUrl.EndsWith('/')) ApiBaseUrl += "/";
    }
}
