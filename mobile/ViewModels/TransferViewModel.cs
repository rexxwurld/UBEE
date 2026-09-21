using CommunityToolkit.Mvvm.Input; using UBee.App.Models; using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class TransferViewModel : ViewModelBase
{
    private readonly IApiClient _api;
    public TransferViewModel(IApiClient api) => _api = api;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string accountNumber="";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string bank="";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private decimal amount;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string description="";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private bool showConfirmation;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private bool submitting;
    public string ConfirmAmount => $"₦{Amount:N2}";
    partial void OnAmountChanged(decimal value)=>OnPropertyChanged(nameof(ConfirmAmount));
    [RelayCommand] private Task ReviewAsync(){ClearMessages();if(string.IsNullOrWhiteSpace(AccountNumber)||Amount<=0){ErrorMessage="Enter a valid recipient and amount.";return Task.CompletedTask;}ShowConfirmation=true;return Task.CompletedTask;}
    [RelayCommand] private void CancelReview()=>ShowConfirmation=false;
    [RelayCommand] private async Task SubmitAsync(){if(Submitting)return;ClearMessages();Submitting=true;try{var key=Guid.NewGuid().ToString("N");var r=await _api.PostAsync<TransferRequest,TransferResponse>("transaction/transfer",new TransferRequest(AccountNumber.Trim(),Amount,string.IsNullOrWhiteSpace(Description)?null:Description.Trim(),string.IsNullOrWhiteSpace(Bank)?null:Bank.Trim(),key),idempotencyKey:key);if(!r.Success){ShowError(r);return;}ShowConfirmation=false;SuccessMessage=r.Data?.Message??"Transfer successful.";AccountNumber="";Bank="";Amount=0;Description="";}finally{Submitting=false;}}
}
