using CommunityToolkit.Mvvm.Input; using UBee.App.Models; using UBee.App.Services; using System.Collections.ObjectModel;
namespace UBee.App.ViewModels;
public partial class WalletViewModel : ViewModelBase
{
    private readonly IApiClient _api; private readonly IClipboardService _clipboard;
    public ObservableCollection<TransactionDto> History { get; } = [];
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private decimal balance;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string accountNumber = "—";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private bool hideBalance;
    public string DisplayBalance => HideBalance ? "₦ ••••••" : $"₦{Balance:N2}";
    partial void OnHideBalanceChanged(bool value) => OnPropertyChanged(nameof(DisplayBalance));
    public WalletViewModel(IApiClient api, IClipboardService clipboard) { _api = api; _clipboard = clipboard; }
    [RelayCommand] public async Task LoadAsync() { if (IsBusy) return; IsBusy = true; try { var w=await _api.GetAsync<WalletEnvelope>("wallet"); if(w.Success&&w.Data?.Data is not null){Balance=w.Data.Data.Balance;AccountNumber=w.Data.Data.AccountNumber??"—";OnPropertyChanged(nameof(DisplayBalance));} var t=await _api.GetAsync<TransactionPageDto>("transaction?limit=20"); History.Clear(); if(t.Success) foreach(var x in t.Data?.Data??[]) History.Add(x); } finally { IsBusy=false; } }
    [RelayCommand] private async Task CopyAccountAsync(){ if(AccountNumber!="—"){await _clipboard.SetTextAsync(AccountNumber);SuccessMessage="Account number copied.";} }
}
