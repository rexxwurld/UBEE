using Microsoft.Extensions.DependencyInjection;

namespace UBee.App;

public partial class App : Application
{
    private readonly IServiceProvider _services;

    // AppShell is NOT injected here: AppShell.xaml uses {StaticResource ...} keys defined in App.xaml,
    // so it must be created only after App.InitializeComponent() has loaded those resources.
    public App(IServiceProvider services)
    {
        InitializeComponent();
        _services = services;
    }

    protected override Window CreateWindow(IActivationState? activationState)
    {
        UBee.App.Services.Logging.CrashLogger.Breadcrumb("App.CreateWindow");
        return new Window(_services.GetRequiredService<AppShell>());
    }
}
