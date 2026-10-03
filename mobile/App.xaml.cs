



namespace UBee.App;

public partial class App : Application
{
    private readonly AppShell _shell;

    public App(AppShell shell)
    {
        InitializeComponent();
        _shell = shell;
    }

    protected override Window CreateWindow(IActivationState? activationState)
    {
        UBee.App.Services.Logging.CrashLogger.Breadcrumb("App.CreateWindow");
        return new Window(_shell);
    }
}
