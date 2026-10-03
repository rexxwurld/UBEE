using Android.App;
using Android.Runtime;

namespace UBee.App
{
    [Application]
    public class MainApplication : MauiApplication
    {
        public MainApplication(IntPtr handle, JniHandleOwnership ownership) : base(handle, ownership) { }

        // Earliest SAFE managed hook: the .NET runtime is not running yet during attachBaseContext
        // (overriding it crashes with UnsatisfiedLinkError), but it is ready by OnCreate, before MAUI starts.
        public override void OnCreate()
        {
            AndroidCrashLogSetup.Initialize(this);
            base.OnCreate();
        }

        protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
    }
}
