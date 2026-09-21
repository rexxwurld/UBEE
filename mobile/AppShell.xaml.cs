using UBee.App.Services;
using UBee.App.Views;

namespace UBee.App;

public partial class AppShell : Shell
{
    private readonly IAuthService _auth;
    private bool _initialized;

    public AppShell(IAuthService auth)
    {
        InitializeComponent();
        _auth = auth;
        Routing.RegisterRoute("beneficiaries", typeof(BeneficiariesPage));
        Routing.RegisterRoute("kyc", typeof(KycPage));
        Routing.RegisterRoute("notifications", typeof(NotificationsPage));
        Navigated += OnNavigated;
    }

    private async void OnNavigated(object? sender, ShellNavigatedEventArgs e)
    {
        if (_initialized) return;
        _initialized = true;
        var hasSession = await _auth.TryRestoreSessionAsync();
        await GoToAsync(hasSession ? "//main/dashboard" : "//login");
    }
}
