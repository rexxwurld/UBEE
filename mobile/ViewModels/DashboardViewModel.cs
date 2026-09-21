using CommunityToolkit.Mvvm.Input;
using UBee.App.Models;
using UBee.App.Services;
using System.Collections.ObjectModel;
namespace UBee.App.ViewModels;
public partial class DashboardViewModel : ViewModelBase
{
    private readonly IApiClient _api; private readonly IAuthService _auth;
    public ObservableCollection<TransactionDto> RecentTransactions { get; } = [];
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string fullname = "User";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private decimal balance;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string accountNumber = "—";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private int totalTransactions;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string kycStatus = "Not verified";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private bool hideBalance;
    public string DisplayBalance => HideBalance ? "₦ ••••••" : $"₦{Balance:N2}";
    partial void OnHideBalanceChanged(bool value) => OnPropertyChanged(nameof(DisplayBalance));
    public DashboardViewModel(IApiClient api, IAuthService auth) { _api = api; _auth = auth; }
    [RelayCommand] public async Task LoadAsync()
    {
        if (IsBusy) return; IsBusy = true; ClearMessages();
        try
        {
            var me = await _auth.GetMeAsync(); if (me.Success && me.Data is not null) { Fullname = me.Data.Fullname ?? "User"; KycStatus = me.Data.KycStatus ?? "Not verified"; }
            var wallet = await _api.GetAsync<WalletEnvelope>("wallet");
            if (wallet.Success && wallet.Data?.Data is not null) { Balance = wallet.Data.Data.Balance; AccountNumber = wallet.Data.Data.AccountNumber ?? "—"; TotalTransactions = wallet.Data.Data.TotalTransactions ?? 0; OnPropertyChanged(nameof(DisplayBalance)); }
            else if (!wallet.Success) ShowError(wallet);
            var tx = await _api.GetAsync<TransactionPageDto>("transaction?limit=5");
            RecentTransactions.Clear(); if (tx.Success) foreach (var item in tx.Data?.Data ?? []) RecentTransactions.Add(item);
        } finally { IsBusy = false; }
    }
    [RelayCommand] private void ToggleBalance() => HideBalance = !HideBalance;
    [RelayCommand] private Task GoTransferAsync() => Shell.Current.GoToAsync("//main/transfer");
    [RelayCommand] private Task GoWalletAsync() => Shell.Current.GoToAsync("//main/wallet");
    [RelayCommand] private Task GoTransactionsAsync() => Shell.Current.GoToAsync("//main/transactions");
    [RelayCommand] private Task GoBeneficiariesAsync() => Shell.Current.GoToAsync("beneficiaries");
    [RelayCommand] private Task GoKycAsync() => Shell.Current.GoToAsync("kyc");
    [RelayCommand] private Task GoNotificationsAsync() => Shell.Current.GoToAsync("notifications");
}
