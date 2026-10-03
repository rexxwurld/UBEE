using Android.App;
using Android.Content;
using Android.OS;
using Android.Provider;
using Android.Runtime;
using UBee.App.Services.Logging;

namespace UBee.App;

/// <summary>
/// Android-specific bootstrap for <see cref="CrashLogger"/>. Called from MainApplication.OnCreate,
/// i.e. before MAUI, DI or any activity exists, so startup crashes are captured too.
/// </summary>
internal static class AndroidCrashLogSetup
{
    private static bool _done;

    public static void Initialize(Context app)
    {
        if (_done) return;
        try
        {
            var privateDir = Path.Combine(app.FilesDir!.AbsolutePath, "U-BEE", "Logs");

            string versionName = "?";
            try { versionName = app.PackageManager?.GetPackageInfo(app.PackageName!, 0)?.VersionName ?? "?"; } catch { }

            var abi = "?";
            try { abi = Build.SupportedAbis?.FirstOrDefault() ?? "?"; } catch { }

            var appInfo = $"U-BEE {versionName} ({app.PackageName})";
            var device = $"Android {Build.VERSION.Release} (API {(int)Build.VERSION.SdkInt}) | {Build.Manufacturer} {Build.Model} | {abi}";

            CrashLogger.Configure(privateDir, appInfo, device, new AndroidPublicLogMirror(app));
            CrashLogger.Echo = EchoToLogcat;
            CrashLogger.InstallGlobalHandlers();

            // Exceptions that surface through Android.Runtime (callbacks from Java into managed code).
            AndroidEnvironment.UnhandledExceptionRaiser += (_, e) =>
            {
                CrashLogger.LogFatal(e.Exception, "AndroidEnvironment.UnhandledExceptionRaiser");
                e.Handled = false; // keep Android's normal behaviour; we only record
            };

            // Java/native-side uncaught exceptions. We chain to the previous handler so behaviour is unchanged.
            Java.Lang.Thread.DefaultUncaughtExceptionHandler =
                new JavaUncaughtHandler(Java.Lang.Thread.DefaultUncaughtExceptionHandler);

            CrashLogger.Info("App process started", new Dictionary<string, string?> { ["Private log dir"] = privateDir });
            CrashLogger.Breadcrumb("Application.OnCreate: logger ready");
            CrashLogger.SyncMirrorIfNeeded();
            _done = true; // only after success, so MainActivity.OnCreate can retry a failed early init
        }
        catch (Exception ex)
        {
            // Never block app start because of logging, but do not fail silently either.
            try { Android.Util.Log.Error("UBEE-LOG", "Logger init failed: " + ex); } catch { }
        }
    }

    private static void EchoToLogcat(LogLevel2 level, string text)
    {
        var prio = level switch
        {
            LogLevel2.Info => Android.Util.LogPriority.Info,
            LogLevel2.Warning => Android.Util.LogPriority.Warn,
            _ => Android.Util.LogPriority.Error,
        };
        // logcat truncates long messages, so send it in line-based chunks.
        var chunk = new System.Text.StringBuilder();
        foreach (var line in text.Split('\n'))
        {
            if (chunk.Length + line.Length > 3000) { Android.Util.Log.WriteLine(prio, "UBEE-LOG", chunk.ToString()); chunk.Clear(); }
            chunk.AppendLine(line.TrimEnd('\r'));
        }
        if (chunk.Length > 0) Android.Util.Log.WriteLine(prio, "UBEE-LOG", chunk.ToString());
    }

    private sealed class JavaUncaughtHandler : Java.Lang.Object, Java.Lang.Thread.IUncaughtExceptionHandler
    {
        private readonly Java.Lang.Thread.IUncaughtExceptionHandler? _previous;
        public JavaUncaughtHandler(Java.Lang.Thread.IUncaughtExceptionHandler? previous) => _previous = previous;

        public void UncaughtException(Java.Lang.Thread? thread, Java.Lang.Throwable? throwable)
        {
            try
            {
                var ex = (object?)throwable as Exception
                         ?? new Exception(throwable?.ToString() ?? "Unknown Java exception");
                CrashLogger.LogFatal(ex, $"Java.Lang.Thread.UncaughtExceptionHandler (thread={thread?.Name})");
            }
            catch { }
            _previous?.UncaughtException(thread, throwable);
        }
    }
}

/// <summary>
/// Copies the private log into Documents/U-BEE/Logs so it shows up in the Files / My Files app.
/// Android 10+ (API 29+): MediaStore (scoped storage, no permission needed for files this app creates).
/// Android 6-9 (API 23-28): direct write to public Documents (needs WRITE_EXTERNAL_STORAGE, requested at runtime),
///                          falling back to the app's external files folder if the permission was denied.
/// Note: Android does not allow apps to create a top-level folder such as /storage/emulated/0/U-BEE on API 29+;
/// "Documents" is the supported public location.
/// </summary>
internal sealed class AndroidPublicLogMirror : IPublicLogMirror
{
    private readonly Context _ctx;

    public AndroidPublicLogMirror(Context ctx) => _ctx = ctx;

    private string _status = "Documents/U-BEE/Logs (not written yet)";
    public string Location => _status;

    public bool Mirror(string publicFileName, string privateFilePath)
    {
        try
        {
            return Build.VERSION.SdkInt >= BuildVersionCodes.Q
                ? MirrorViaMediaStore(publicFileName, privateFilePath)
                : MirrorLegacy(publicFileName, privateFilePath);
        }
        catch (Exception ex)
        {
            try { Android.Util.Log.Warn("UBEE-LOG", "Public log copy exception: " + ex); } catch { }
            return false;
        }
    }

    private bool MirrorViaMediaStore(string fileName, string privatePath)
    {
        // 1) preferred: Documents/U-BEE/Logs   2) fallback: Download/U-BEE/Logs
        string? err1 = null, err2 = null;
        try
        {
            if (WriteViaMediaStore(MediaStore.Files.GetContentUri("external"), "Documents/U-BEE/Logs/", fileName, privatePath))
            { _status = "Documents/U-BEE/Logs"; return true; }
        }
        catch (Exception ex) { err1 = ex.GetType().Name + ": " + ex.Message; }

        try
        {
            if (WriteViaMediaStore(MediaStore.Downloads.ExternalContentUri, "Download/U-BEE/Logs/", fileName, privatePath))
            { _status = "Download/U-BEE/Logs (Documents failed: " + (err1 ?? "null uri") + ")"; return true; }
        }
        catch (Exception ex) { err2 = ex.GetType().Name + ": " + ex.Message; }

        _status = "FAILED. Documents: " + (err1 ?? "null uri") + " | Download: " + (err2 ?? "null uri");
        try { Android.Util.Log.Warn("UBEE-LOG", "Public log copy " + _status); } catch { }
        return false;
    }

    private bool WriteViaMediaStore(Android.Net.Uri? collection, string relativePath, string fileName, string privatePath)
    {
        var resolver = _ctx.ContentResolver;
        if (resolver is null || collection is null) return false;

        Android.Net.Uri? uri = null;
        using (var cursor = resolver.Query(collection, new[] { "_id" },
                   "_display_name=? AND relative_path=?", new[] { fileName, relativePath }, null))
        {
            if (cursor != null && cursor.MoveToFirst())
                uri = ContentUris.WithAppendedId(collection, cursor.GetLong(0));
        }

        if (uri is null)
        {
            var values = new ContentValues();
            values.Put("_display_name", fileName);
            values.Put("mime_type", "text/plain");
            values.Put("relative_path", relativePath);
            uri = resolver.Insert(collection, values);
        }
        if (uri is null) return false;

        using var output = resolver.OpenOutputStream(uri, "wt"); // "wt" = write + truncate
        if (output is null) return false;
        using var input = new FileStream(privatePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        input.CopyTo(output);
        output.Flush();
        return true;
    }

#pragma warning disable CS0618 // legacy storage APIs are intentional for API 23-28
    private bool MirrorLegacy(string fileName, string privatePath)
    {
        string? baseDir = null;
        if (_ctx.CheckSelfPermission(Android.Manifest.Permission.WriteExternalStorage) == Android.Content.PM.Permission.Granted)
            baseDir = Android.OS.Environment.GetExternalStoragePublicDirectory(Android.OS.Environment.DirectoryDocuments)?.AbsolutePath;
        baseDir ??= _ctx.GetExternalFilesDir(null)?.AbsolutePath; // permission denied: app's external folder
        if (baseDir is null) return false;

        var dir = Path.Combine(baseDir, "U-BEE", "Logs");
        Directory.CreateDirectory(dir);
        var dest = Path.Combine(dir, fileName);
        File.Copy(privatePath, dest, overwrite: true);
        try { Android.Media.MediaScannerConnection.ScanFile(_ctx, new[] { dest }, new[] { "text/plain" }, null); } catch { }
        return true;
    }
#pragma warning restore CS0618
}
