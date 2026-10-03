using Android.App;
using Android.Content;
using Android.Runtime;

namespace UBee.App
{
    [Application]
    public class MainApplication : MauiApplication
    {
        public MainApplication(IntPtr handle, JniHandleOwnership ownership) : base(handle, ownership) { }

        // Earliest managed hook that has a Context: runs before MauiProgram / DI / any activity.
        protected override void AttachBaseContext(Context? @base)
        {
            base.AttachBaseContext(@base);
            if (@base is not null) AndroidCrashLogSetup.Initialize(this);
        }

        protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
    }
}
