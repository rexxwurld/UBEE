using Microsoft.Extensions.Logging;

namespace UBee.App.Services.Logging;

/// <summary>
/// Bridges the standard ILogger&lt;T&gt; pipeline into <see cref="CrashLogger"/> so any existing or future
/// logger.LogError(...) / LogWarning(...) call lands in the same persistent file. Warning and above only.
/// </summary>
public sealed class FileLoggerProvider : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName) => new FileLogger(categoryName);
    public void Dispose() { }

    private sealed class FileLogger : ILogger
    {
        private readonly string _category;
        public FileLogger(string category) => _category = category;

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => logLevel >= Microsoft.Extensions.Logging.LogLevel.Warning;

        public void Log<TState>(Microsoft.Extensions.Logging.LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            try
            {
                var level = logLevel switch
                {
                    Microsoft.Extensions.Logging.LogLevel.Warning => LogLevel2.Warning,
                    Microsoft.Extensions.Logging.LogLevel.Error => LogLevel2.Error,
                    _ => LogLevel2.Fatal,
                };
                CrashLogger.Write(level, _category, formatter(state, exception), exception, null, null);
            }
            catch { }
        }
    }
}
