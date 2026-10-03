using CommunityToolkit.Mvvm.Input; using UBee.App.Models; using UBee.App.Services; using System.Collections.ObjectModel;
namespace UBee.App.ViewModels;
public partial class BeneficiariesViewModel:ViewModelBase
{
 private readonly IBeneficiaryService _service; public ObservableCollection<BeneficiaryDto> Items{get;}=[];
 [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string name=""; [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string accountNumber=""; [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string bank="";
 public BeneficiariesViewModel(IBeneficiaryService service)=>_service=service;
 [RelayCommand] public async Task LoadAsync(){Items.Clear();foreach(var x in await _service.GetAllAsync())Items.Add(x);}
 [RelayCommand] private async Task AddAsync(){ClearMessages();ClearMessages();var acct=AccountNumber.Trim();if(string.IsNullOrWhiteSpace(Name)||acct.Length!=10||!acct.All(char.IsAsciiDigit)){ErrorMessage="Enter a name and a 10-digit account number.";return;}await _service.AddAsync(new BeneficiaryDto{Name=Name.Trim(),AccountNumber=acct,Bank=string.IsNullOrWhiteSpace(Bank)?"U-BEE":Bank.Trim()});Name=AccountNumber=Bank="";await LoadAsync();SuccessMessage="Saved to favourites on this device.";}
 [RelayCommand] private async Task RemoveAsync(BeneficiaryDto item){await _service.RemoveAsync(item.Id);await LoadAsync();}
}
