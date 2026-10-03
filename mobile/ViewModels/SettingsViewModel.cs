using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class SettingsViewModel : ViewModelBase
{
    private readonly IAuthService _auth;
    [ObservableProperty, NotifyPropertyChangedFor(nameof(Initial))] private string fullname = "User";
    [ObservableProperty] private string email = "";
    [ObservableProperty] private string phone = "";
    [ObservableProperty] private string tierLabel = "Tier 1";
    public string Initial => Fullname.Trim().Length > 0 ? Fullname.Trim()[..1].ToUpperInvariant() : "U";
    public SettingsViewModel(IAuthService auth) => _auth = auth;
    [RelayCommand] public async Task LoadAsync()
    {
        var r = await _auth.GetMeAsync();
        if (r.Success && r.Data is not null) { Fullname = r.Data.Fullname ?? "User"; Email = r.Data.Email ?? ""; Phone = r.Data.Phone ?? ""; TierLabel = $"Tier {r.Data.TierNumber}"; }
    }
    [RelayCommand] private async Task LogoutAsync() { IsBusy = true; try { await _auth.LogoutAsync(); await Shell.Current.GoToAsync("//login"); } finally { IsBusy = false; } }
    [RelayCommand] private Task GoProfileAsync() => Shell.Current.GoToAsync("profile");
    [RelayCommand] private Task GoTransactionsAsync() => Shell.Current.GoToAsync("//main/transactions");
    [RelayCommand] private Task GoBeneficiariesAsync() => Shell.Current.GoToAsync("beneficiaries");
    [RelayCommand] private Task GoKycAsync() => Shell.Current.GoToAsync("kyc");
    [RelayCommand] private Task GoNotificationsAsync() => Shell.Current.GoToAsync("notifications");
}
