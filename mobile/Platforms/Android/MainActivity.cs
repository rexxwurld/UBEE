using Android.App;
using Android.Content.PM;
using Android.OS;
using UBee.App.Services.Logging;

namespace UBee.App
{
    [Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, LaunchMode = LaunchMode.SingleTop, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
    public class MainActivity : MauiAppCompatActivity
    {
        protected override void OnCreate(Bundle? savedInstanceState)
        {
            CrashLogger.Breadcrumb("MainActivity.OnCreate begin");
            base.OnCreate(savedInstanceState);
            CrashLogger.Breadcrumb("MainActivity.OnCreate end");

#pragma warning disable CA1416
            // Android 6-9 only: public Documents needs a runtime permission. Android 10+ uses MediaStore (no permission).
            if (Build.VERSION.SdkInt <= BuildVersionCodes.P &&
                CheckSelfPermission(Android.Manifest.Permission.WriteExternalStorage) != Permission.Granted)
            {
                try { RequestPermissions(new[] { Android.Manifest.Permission.WriteExternalStorage }, 9001); } catch { }
            }
#pragma warning restore CA1416
        }

        protected override void OnResume()
        {
            base.OnResume();
            CrashLogger.Breadcrumb("MainActivity.OnResume");
            CrashLogger.SyncMirrorIfNeeded();
        }
    }
}
