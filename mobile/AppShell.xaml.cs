using UBee.App.Services;
using UBee.App.Services.Logging;
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
        Routing.RegisterRoute("profile", typeof(ProfilePage));
        Routing.RegisterRoute("transfer-bank", typeof(BankTransferPage));
        Routing.RegisterRoute("transaction-details", typeof(TransactionDetailsPage));
        Navigated += OnNavigated;
    }


    private async void OnNavigated(object? sender, ShellNavigatedEventArgs e)
{
    if (_initialized) return;
    _initialized = true;
    var hasSession = false;
    CrashLogger.Breadcrumb("AppShell: first Navigated, restoring session");
    try { hasSession = await _auth.TryRestoreSessionAsync(); } catch (Exception ex) { CrashLogger.Error(ex, "TryRestoreSessionAsync failed at startup"); }
    CrashLogger.Breadcrumb($"AppShell: session restored = {hasSession}");
    try { await GoToAsync(hasSession ? "//main/dashboard" : "//login"); } catch (Exception ex) { CrashLogger.Error(ex, "Initial navigation failed", new Dictionary<string, string?> { ["Target"] = hasSession ? "//main/dashboard" : "//login" }); }
}

    
}
