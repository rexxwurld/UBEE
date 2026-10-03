namespace UBee.App.Services;
public interface IClipboardService { Task SetTextAsync(string text); }
public sealed class ClipboardService : IClipboardService { public Task SetTextAsync(string text) => Clipboard.Default.SetTextAsync(text); }
