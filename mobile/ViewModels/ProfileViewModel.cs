using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using UBee.App.Services;
namespace UBee.App.ViewModels;

/// <summary>"My Profile": only fields the backend actually holds (no gender/address/nickname).</summary>
public partial class ProfileViewModel : ViewModelBase
{
    private readonly IAuthService _auth; private readonly IClipboardService _clipboard;
    public ProfileViewModel(IAuthService auth, IClipboardService clipboard) { _auth = auth; _clipboard = clipboard; }

    [ObservableProperty] private string fullname = "";
    [ObservableProperty] private string initial = "U";
    [ObservableProperty] private string accountNumber = "—";
    [ObservableProperty] private string tierLabel = "Tier 1";
    [ObservableProperty] private string phoneDisplay = "—";
    [ObservableProperty] private string emailMasked = "—";
    [ObservableProperty] private string dobDisplay = "Not provided";
    [ObservableProperty] private string kycStatusText = "Unverified";

    [RelayCommand] public async Task LoadAsync()
    {
        var r = await _auth.GetMeAsync();
        if (!r.Success || r.Data is not { } me) { ErrorMessage = r.Error?.Message; return; }

        Fullname = me.Fullname ?? "";
        Initial = Fullname.Trim().Length > 0 ? Fullname.Trim()[..1].ToUpperInvariant() : "U";
        AccountNumber = me.AccountNumber ?? "—";
        TierLabel = $"Tier {me.TierNumber}";
        KycStatusText = string.IsNullOrEmpty(me.KycStatus) ? "Unverified" : char.ToUpper(me.KycStatus[0]) + me.KycStatus[1..];
        PhoneDisplay = PhoneFormatter.ToNational(me.Phone) is { } n ? $"+234 {n[..3]} {n[3..6]} {n[6..]}" : me.Phone ?? "—";
        EmailMasked = MaskEmail(me.Email);
        DobDisplay = me.DateOfBirth?.ToString("dd MMM yyyy") ?? "Not provided";
    }

    private static string MaskEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return "—";
        var at = email.IndexOf('@');
        return at > 0 ? email[0] + "*" + email[at..] : "—";
    }

    [RelayCommand] private async Task CopyAccountAsync() { if (AccountNumber != "—") { await _clipboard.SetTextAsync(AccountNumber); SuccessMessage = "Account number copied."; } }
    [RelayCommand] private Task GoLimitsAsync() => Shell.Current.GoToAsync("kyc");
}
