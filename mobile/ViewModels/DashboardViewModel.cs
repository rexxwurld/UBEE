using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using UBee.App.Models;
using UBee.App.Services;
using System.Collections.ObjectModel;
namespace UBee.App.ViewModels;
public partial class DashboardViewModel : ViewModelBase
{
    private readonly IApiClient _api; private readonly IAuthService _auth;
    public ObservableCollection<TransactionDto> RecentTransactions { get; } = [];
    [ObservableProperty, NotifyPropertyChangedFor(nameof(FirstName)), NotifyPropertyChangedFor(nameof(Initial))] private string fullname = "User";
    [ObservableProperty] private decimal balance;
    [ObservableProperty] private string accountNumber = "—";
    [ObservableProperty] private int totalTransactions;
    [ObservableProperty] private string kycStatus = "Not verified";
    [ObservableProperty] private int tierNumber = 1;
    [ObservableProperty] private bool hideBalance;
    public string FirstName => Fullname.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() is { } f ? char.ToUpper(f[0]) + f[1..].ToLower() : "there";
    public string Initial => Fullname.Trim().Length > 0 ? Fullname.Trim()[..1].ToUpperInvariant() : "U";
    public string DisplayBalance => HideBalance ? "₦ ••••••" : $"₦{Balance:N2}";
    public string EyeIcon => HideBalance ? "ic_eye_off_w.svg" : "ic_eye_w.svg";
    partial void OnHideBalanceChanged(bool value) { OnPropertyChanged(nameof(DisplayBalance)); OnPropertyChanged(nameof(EyeIcon)); }
    public DashboardViewModel(IApiClient api, IAuthService auth) { _api = api; _auth = auth; }
    [RelayCommand] public async Task LoadAsync()
    {
        if (IsBusy) return; IsBusy = true; ClearMessages();
        try
        {
            var me = await _auth.GetMeAsync(); if (me.Success && me.Data is not null) { Fullname = me.Data.Fullname ?? "User"; KycStatus = me.Data.KycStatus ?? "Not verified"; TierNumber = me.Data.TierNumber; }
            var wallet = await _api.GetAsync<WalletEnvelope>("wallet");
            if (wallet.Success && wallet.Data?.Data is not null) { Balance = wallet.Data.Data.Balance; AccountNumber = wallet.Data.Data.AccountNumber ?? "—"; TotalTransactions = wallet.Data.Data.TotalTransactions ?? 0; OnPropertyChanged(nameof(DisplayBalance)); }
            else if (!wallet.Success) ShowError(wallet);
            var tx = await _api.GetAsync<TransactionPageDto>("transaction?limit=5");
            RecentTransactions.Clear(); if (tx.Success) foreach (var item in tx.Data?.Data ?? []) RecentTransactions.Add(item);
        } finally { IsBusy = false; }
    }
    [RelayCommand] private void ToggleBalance() => HideBalance = !HideBalance;
    [RelayCommand] private Task GoTransferAsync() => Shell.Current.GoToAsync("//main/transfer");
    [RelayCommand] private Task GoBankAsync() => Shell.Current.GoToAsync("transfer-bank");
    [RelayCommand] private Task GoWalletAsync() => Shell.Current.GoToAsync("//main/wallet");
    [RelayCommand] private Task GoTransactionsAsync() => Shell.Current.GoToAsync("//main/transactions");
    [RelayCommand] private Task GoBeneficiariesAsync() => Shell.Current.GoToAsync("beneficiaries");
    [RelayCommand] private Task GoKycAsync() => Shell.Current.GoToAsync("kyc");
    [RelayCommand] private Task GoProfileAsync() => Shell.Current.GoToAsync("profile");
    [RelayCommand] private Task GoNotificationsAsync() => Shell.Current.GoToAsync("notifications");
}
