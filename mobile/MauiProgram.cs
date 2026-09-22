using Microsoft.Extensions.Logging;
using UBee.App.Services;
using UBee.App.ViewModels;
using UBee.App.Views;

namespace UBee.App;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>();

        builder.Services.AddHttpClient<IApiClient, ApiClient>();
        builder.Services.AddSingleton<IAppConfiguration, AppConfiguration>();
        builder.Services.AddSingleton<ISecureStorageService, SecureStorageService>();
        builder.Services.AddSingleton<IAuthService, AuthService>();
        builder.Services.AddSingleton<IBeneficiaryService, BeneficiaryService>();
        builder.Services.AddSingleton<IClipboardService, ClipboardService>();

        builder.Services.AddTransient<LoginViewModel>();
        builder.Services.AddTransient<RegisterViewModel>();
        builder.Services.AddTransient<ForgotPasswordViewModel>();
        builder.Services.AddTransient<VerifyOtpViewModel>();
        builder.Services.AddTransient<ResetPasswordViewModel>();
        builder.Services.AddTransient<DashboardViewModel>();
        builder.Services.AddTransient<WalletViewModel>();
        builder.Services.AddTransient<TransferViewModel>();
        builder.Services.AddTransient<TransactionsViewModel>();
        builder.Services.AddTransient<KycViewModel>();
        builder.Services.AddTransient<BeneficiariesViewModel>();
        builder.Services.AddTransient<NotificationsViewModel>();
        builder.Services.AddTransient<SettingsViewModel>();

        builder.Services.AddTransient<LoginPage>();
        builder.Services.AddTransient<RegisterPage>();
        builder.Services.AddTransient<ForgotPasswordPage>();
        builder.Services.AddTransient<VerifyOtpPage>();
        builder.Services.AddTransient<ResetPasswordPage>();
        builder.Services.AddTransient<DashboardPage>();
        builder.Services.AddTransient<WalletPage>();
        builder.Services.AddTransient<TransferPage>();
        builder.Services.AddTransient<TransactionsPage>();
        builder.Services.AddTransient<KycPage>();
        builder.Services.AddTransient<BeneficiariesPage>();
        builder.Services.AddTransient<NotificationsPage>();
        builder.Services.AddTransient<SettingsPage>();
        builder.Services.AddTransient<AppShell>();
#if DEBUG
        builder.Logging.AddDebug();
#endif
        return builder.Build();
    }
}
