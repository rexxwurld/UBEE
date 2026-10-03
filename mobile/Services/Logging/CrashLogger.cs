using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text;

namespace UBee.App.Services.Logging;

public enum LogLevel2 { Info, Warning, Error, Fatal }

/// <summary>Platform hook that copies the private log into a user-visible public location.</summary>
public interface IPublicLogMirror
{
    /// <summary>Human readable description of where the public copy lives.</summary>
    string Location { get; }

    /// <summary>Overwrite the public copy named <paramref name="publicFileName"/> with the content of <paramref name="privateFilePath"/>.</summary>
    /// <returns>true when the public copy was written.</returns>
    bool Mirror(string publicFileName, string privateFilePath);
}

/// <summary>
/// Persistent, crash-safe text logger for U-BEE.
///
/// Design:
///  * Every entry is written SYNCHRONOUSLY and flushed to disk to an app-private file first
///    (always writable, survives crashes). The file is then mirrored to the public
///    Documents/U-BEE/Logs folder (Android: MediaStore) so it is visible in the Files app.
///  * Initialisation is lazy and can never throw. All public methods are exception-safe.
///  * Everything is passed through <see cref="LogSanitizer"/> before being written.
/// </summary>
public static class CrashLogger
{
    public const string LogFileName = "ubee-crash-log.txt";
    private const long MaxFileBytes = 512 * 1024;   // rotate when the active file would exceed this
    private const int MaxArchives = 3;              // ubee-crash-log.1.txt .. .3.txt (private); .1 is also mirrored
    private const int MaxBreadcrumbs = 30;
    private const int MaxChainDepth = 10;

    private static readonly object Gate = new();
    private static readonly LinkedList<string> Crumbs = new();
    /// <summary>Optional platform hook that receives every formatted entry (Android: copies it to logcat, tag UBEE-LOG).</summary>
    public static Action<LogLevel2, string>? Echo { get; set; }

    private static bool _handlersInstalled;
    private static bool _configured;
    private static string? _logDir;
    private static IPublicLogMirror? _mirror;
    private static string _appInfo = "U-BEE (unknown version)";
    private static string _deviceInfo = Environment.OSVersion.ToString();
    private static volatile bool _mirrorDirty = true;
    private static string? _lastFatalKey;
    private static DateTime _lastFatalUtc = DateTime.MinValue;

    // ------------------------------------------------------------------ setup

    /// <summary>Called by the platform layer as early as possible (Android: Application.AttachBaseContext).</summary>
    public static void Configure(string privateLogDirectory, string appInfo, string deviceInfo, IPublicLogMirror? mirror)
    {
        try
        {
            lock (Gate)
            {
                _logDir = privateLogDirectory;
                _appInfo = appInfo;
                _deviceInfo = deviceInfo;
                _mirror = mirror;
                Directory.CreateDirectory(privateLogDirectory);
                _configured = true;
            }
        }
        catch { /* logger must never throw */ }
    }

    private static void EnsureConfigured()
    {
        if (_configured) return;
        try
        {
            // Fallback for platforms without a dedicated setup (e.g. iOS): app-private folder only.
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "U-BEE", "Logs");
            var asm = typeof(CrashLogger).Assembly.GetName();
            Configure(dir, $"U-BEE {asm.Version}", Environment.OSVersion.ToString(), null);
        }
        catch { }
    }

    /// <summary>Hooks every global "unhandled exception" source. Safe to call more than once.</summary>
    public static void InstallGlobalHandlers()
    {
        lock (Gate)
        {
            if (_handlersInstalled) return;
            _handlersInstalled = true;
        }
        try
        {
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
                LogFatal(e.ExceptionObject as Exception ?? new Exception(e.ExceptionObject?.ToString() ?? "Unknown unhandled exception"),
                         $"AppDomain.UnhandledException (terminating={e.IsTerminating})");

            TaskScheduler.UnobservedTaskException += (_, e) =>
                Write(LogLevel2.Error, "TaskScheduler.UnobservedTaskException", "Unobserved task exception", e.Exception, null, null);
        }
        catch { }
    }

    // ------------------------------------------------------------------ breadcrumbs

    /// <summary>Records a short non-sensitive "what was the app doing" note; the latest ones are attached to error entries.</summary>
    public static void Breadcrumb(string message)
    {
        try
        {
            var line = $"{DateTime.Now:HH:mm:ss.fff} {LogSanitizer.Clean(message)}";
            lock (Gate)
            {
                Crumbs.AddLast(line);
                while (Crumbs.Count > MaxBreadcrumbs) Crumbs.RemoveFirst();
            }
        }
        catch { }
    }

    // ------------------------------------------------------------------ public API

    public static void Info(string message, IDictionary<string, string?>? context = null,
        [CallerMemberName] string member = "", [CallerFilePath] string file = "")
        => Write(LogLevel2.Info, Caller(file, member), message, null, context, null);

    public static void Warning(string message, Exception? ex = null, IDictionary<string, string?>? context = null,
        [CallerMemberName] string member = "", [CallerFilePath] string file = "")
        => Write(LogLevel2.Warning, Caller(file, member), message, ex, context, null);

    /// <summary>Log a caught exception. Use in catch blocks that would otherwise swallow the error.</summary>
    public static void Error(Exception ex, string? message = null, IDictionary<string, string?>? context = null,
        [CallerMemberName] string member = "", [CallerFilePath] string file = "", [CallerLineNumber] int line = 0)
        => Write(LogLevel2.Error, Caller(file, member) + (line > 0 ? $":{line}" : ""), message, ex, context, null);

    /// <summary>Log an exception that is about to terminate the app.</summary>
    public static void LogFatal(Exception ex, string source)
    {
        try
        {
            // De-duplicate: the same crash is usually reported by both the .NET and the Java handler.
            var key = ex.GetType().FullName + "|" + ex.Message;
            lock (Gate)
            {
                if (key == _lastFatalKey && (DateTime.UtcNow - _lastFatalUtc).TotalSeconds < 10) return;
                _lastFatalKey = key;
                _lastFatalUtc = DateTime.UtcNow;
            }
        }
        catch { }
        Write(LogLevel2.Fatal, source, "UNHANDLED EXCEPTION - the app is crashing", ex, null, null);
    }

    /// <summary>Path of the private (always-written) copy, for diagnostics.</summary>
    public static string? PrivateLogPath
    {
        get { EnsureConfigured(); return _logDir is null ? null : Path.Combine(_logDir, LogFileName); }
    }

    /// <summary>Re-copies the private log to the public location if the last mirror attempt failed.</summary>
    public static void SyncMirrorIfNeeded()
    {
        if (!_mirrorDirty) return;
        Task.Run(() =>
        {
            try { lock (Gate) { MirrorNoLock(); } } catch { }
        });
    }

    // ------------------------------------------------------------------ core writer

    internal static void Write(LogLevel2 level, string source, string? message, Exception? ex,
        IDictionary<string, string?>? context, string? extra)
    {
        try
        {
            EnsureConfigured();
            if (_logDir is null) return;

            var entry = Format(level, source, message, ex, context, extra);
            try { Echo?.Invoke(level, entry); } catch { }   // logcat copy first: survives even if file I/O fails

            lock (Gate)
            {
                var path = Path.Combine(_logDir, LogFileName);
                RotateIfNeeded(path, Encoding.UTF8.GetByteCount(entry));
                using (var fs = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read))
                {
                    var bytes = new UTF8Encoding(false).GetBytes(entry);
                    fs.Write(bytes, 0, bytes.Length);
                    fs.Flush(true);   // force to disk: must survive the process dying right after this call
                }
                _mirrorDirty = true;
                MirrorNoLock();
            }
        }
        catch { /* the logger must never be the cause of a crash */ }
    }

    private static void RotateIfNeeded(string path, int incomingBytes)
    {
        try
        {
            var info = new FileInfo(path);
            if (!info.Exists || info.Length + incomingBytes <= MaxFileBytes) return;

            for (var i = MaxArchives; i >= 1; i--)
            {
                var src = i == 1 ? path : ArchivePath(path, i - 1);
                var dst = ArchivePath(path, i);
                if (!File.Exists(src)) continue;
                if (File.Exists(dst)) File.Delete(dst);
                File.Move(src, dst);
            }
            // After rotation the newest archive changed too.
            _mirrorDirty = true;
        }
        catch
        {
            // If rotation fails, truncate rather than letting the file grow forever.
            try { File.Delete(path); } catch { }
        }
    }

    private static string ArchivePath(string path, int n)
        => Path.Combine(Path.GetDirectoryName(path)!, $"{Path.GetFileNameWithoutExtension(path)}.{n}{Path.GetExtension(path)}");

    private static void MirrorNoLock()
    {
        try
        {
            if (_mirror is null || _logDir is null) { _mirrorDirty = false; return; }
            var main = Path.Combine(_logDir, LogFileName);
            var ok = !File.Exists(main) || _mirror.Mirror(LogFileName, main);
            var arch1 = ArchivePath(main, 1);
            if (File.Exists(arch1)) ok &= _mirror.Mirror(Path.GetFileName(arch1), arch1);
            _mirrorDirty = !ok;
        }
        catch { _mirrorDirty = true; }
    }

    // ------------------------------------------------------------------ formatting

    private static string Caller(string file, string member)
    {
        var cls = string.IsNullOrEmpty(file) ? "?" : Path.GetFileNameWithoutExtension(file.Replace('\\', '/'));
        return string.IsNullOrEmpty(member) ? cls : $"{cls}.{member}";
    }

    private static string Format(LogLevel2 level, string source, string? message, Exception? ex,
        IDictionary<string, string?>? context, string? extra)
    {
        var sb = new StringBuilder(2048);
        var now = DateTimeOffset.Now;
        sb.AppendLine(new string('=', 78));
        sb.Append(now.ToString("yyyy-MM-dd HH:mm:ss.fff zzz")).Append("  [").Append(level.ToString().ToUpperInvariant()).AppendLine("]");
        sb.Append("Source      : ").AppendLine(LogSanitizer.Clean(source));
        if (ex is not null) sb.Append("Location    : ").AppendLine(LogSanitizer.Clean(TopFrame(ex)));
        sb.Append("Thread      : ").Append(Environment.CurrentManagedThreadId)
          .AppendLine(Thread.CurrentThread.Name is { Length: > 0 } n ? $" ({n})" : "");
        sb.Append("App         : ").AppendLine(_appInfo);
        sb.Append("Device      : ").AppendLine(_deviceInfo);
        if (_mirror is not null) sb.Append("Public copy : ").AppendLine(LogSanitizer.Clean(_mirror.Location));
        if (!string.IsNullOrWhiteSpace(message)) sb.Append("Message     : ").AppendLine(LogSanitizer.Clean(message));
        if (!string.IsNullOrWhiteSpace(extra)) sb.Append("Detail      : ").AppendLine(LogSanitizer.Clean(extra));

        if (context is { Count: > 0 })
        {
            sb.AppendLine("Context     :");
            foreach (var kv in context)
            {
                if (LogSanitizer.IsSensitiveKey(kv.Key)) continue;   // drop sensitive-looking keys entirely
                sb.Append("  ").Append(LogSanitizer.Clean(kv.Key)).Append(" = ").AppendLine(LogSanitizer.Clean(kv.Value));
            }
        }

        if (level >= LogLevel2.Error)
        {
            string[] crumbs;
            lock (Gate) crumbs = Crumbs.ToArray();
            if (crumbs.Length > 0)
            {
                sb.AppendLine("Breadcrumbs (oldest first):");
                foreach (var c in crumbs) sb.Append("  ").AppendLine(c);
            }
        }

        if (ex is not null) AppendException(sb, ex, "Exception", 0);
        sb.AppendLine();
        return sb.ToString();
    }

    private static void AppendException(StringBuilder sb, Exception ex, string label, int depth)
    {
        if (depth >= MaxChainDepth) { sb.AppendLine("  ... (inner exception chain truncated)"); return; }
        var pad = new string(' ', depth * 2);
        sb.Append(pad).Append(label).Append(" : ").AppendLine(ex.GetType().FullName);
        sb.Append(pad).Append("  Message : ").AppendLine(LogSanitizer.Clean(ex.Message));
        if (ex.HResult != 0) sb.Append(pad).Append("  HResult : 0x").AppendLine(ex.HResult.ToString("X8"));
        var stack = ex.StackTrace;
        if (!string.IsNullOrWhiteSpace(stack))
        {
            sb.Append(pad).AppendLine("  Stack trace:");
            foreach (var line in LogSanitizer.Clean(stack).Split('\n'))
                sb.Append(pad).Append("    ").AppendLine(line.TrimEnd('\r'));
        }

        if (ex is AggregateException agg)
        {
            var i = 0;
            foreach (var inner in agg.InnerExceptions) AppendException(sb, inner, $"Inner exception [{++i}]", depth + 1);
        }
        else if (ex.InnerException is not null)
        {
            AppendException(sb, ex.InnerException, "Inner exception", depth + 1);
        }
    }

    private static string TopFrame(Exception ex)
    {
        try
        {
            var st = new StackTrace(ex, true);
            for (var i = 0; i < st.FrameCount; i++)
            {
                var f = st.GetFrame(i);
                var m = f?.GetMethod();
                if (m is null) continue;
                var loc = $"{m.DeclaringType?.FullName}.{m.Name}";
                var file = f!.GetFileName();
                if (!string.IsNullOrEmpty(file)) loc += $" ({Path.GetFileName(file)}:{f.GetFileLineNumber()})";
                return loc;
            }
        }
        catch { }
        return ex.TargetSite is { } t ? $"{t.DeclaringType?.FullName}.{t.Name}" : "unknown";
    }
}
