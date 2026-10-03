using Android.App;
using Android.Content;
using Android.OS;
using Android.Provider;
using Android.Runtime;
using UBee.App.Services.Logging;

namespace UBee.App;

/// <summary>
/// Android-specific bootstrap for <see cref="CrashLogger"/>. Called from MainApplication.AttachBaseContext,
/// i.e. before MAUI, DI or any activity exists, so startup crashes are captured too.
/// </summary>
internal static class AndroidCrashLogSetup
{
    private static bool _done;

    public static void Initialize(Context app)
    {
        if (_done) return;
        _done = true;
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
            CrashLogger.Breadcrumb("Application.AttachBaseContext: logger ready");
            CrashLogger.SyncMirrorIfNeeded();
        }
        catch { /* never block app start because of logging */ }
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
    private const string RelativePath = "Documents/U-BEE/Logs/";
    private readonly Context _ctx;

    public AndroidPublicLogMirror(Context ctx) => _ctx = ctx;

    public string Location => "Internal storage/Documents/U-BEE/Logs/";

    public bool Mirror(string publicFileName, string privateFilePath)
    {
        try
        {
            return Build.VERSION.SdkInt >= BuildVersionCodes.Q
                ? MirrorViaMediaStore(publicFileName, privateFilePath)
                : MirrorLegacy(publicFileName, privateFilePath);
        }
        catch { return false; }
    }

    private bool MirrorViaMediaStore(string fileName, string privatePath)
    {
        var resolver = _ctx.ContentResolver;
        if (resolver is null) return false;
        var collection = MediaStore.Files.GetContentUri("external");
        if (collection is null) return false;

        Android.Net.Uri? uri = null;
        using (var cursor = resolver.Query(collection, new[] { "_id" },
                   "_display_name=? AND relative_path=?", new[] { fileName, RelativePath }, null))
        {
            if (cursor != null && cursor.MoveToFirst())
                uri = ContentUris.WithAppendedId(collection, cursor.GetLong(0));
        }

        if (uri is null)
        {
            var values = new ContentValues();
            values.Put("_display_name", fileName);
            values.Put("mime_type", "text/plain");
            values.Put("relative_path", RelativePath);
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
