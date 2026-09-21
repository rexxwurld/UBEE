using CommunityToolkit.Mvvm.Input; using UBee.App.Models; using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class SettingsViewModel:ViewModelBase
{
 private readonly IAuthService _auth; [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string fullname="User"; [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string email=""; [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string phone="";
 public SettingsViewModel(IAuthService auth)=>_auth=auth;
 [RelayCommand] public async Task LoadAsync(){var r=await _auth.GetMeAsync();if(r.Success&&r.Data is not null){Fullname=r.Data.Fullname??"User";Email=r.Data.Email??"";Phone=r.Data.Phone??"";}}
 [RelayCommand] private async Task LogoutAsync(){IsBusy=true;try{await _auth.LogoutAsync();await Shell.Current.GoToAsync("//login");}finally{IsBusy=false;}}
 [RelayCommand] private Task GoBeneficiariesAsync()=>Shell.Current.GoToAsync("beneficiaries"); [RelayCommand] private Task GoKycAsync()=>Shell.Current.GoToAsync("kyc"); [RelayCommand] private Task GoNotificationsAsync()=>Shell.Current.GoToAsync("notifications");
}
