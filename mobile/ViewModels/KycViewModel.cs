using CommunityToolkit.Mvvm.Input; using UBee.App.Models; using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class KycViewModel:ViewModelBase
{
 private readonly IApiClient _api; public KycViewModel(IApiClient api)=>_api=api;
 [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string bvn=""; [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string nin=""; [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private DateTime dateOfBirth=DateTime.Today.AddYears(-18); [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string status="Not loaded"; [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string tier="—";
 [RelayCommand] public async Task LoadAsync(){var r=await _api.GetAsync<ApiEnvelope<KycStatusDto>>("kyc/status");if(r.Success&&r.Data?.Data is not null){Status=r.Data.Data.KycStatus??"unverified";Tier=r.Data.Data.KycTier??"tier1";}}
 [RelayCommand] private async Task SubmitAsync(){ClearMessages();if(string.IsNullOrWhiteSpace(Bvn)&&string.IsNullOrWhiteSpace(Nin)){ErrorMessage="Enter BVN or NIN.";return;}IsBusy=true;try{var r=await _api.PostAsync<KycSubmitRequest,ApiEnvelope<KycStatusDto>>("kyc/submit",new KycSubmitRequest(string.IsNullOrWhiteSpace(Bvn)?null:Bvn.Trim(),string.IsNullOrWhiteSpace(Nin)?null:Nin.Trim(),DateOfBirth.ToString("yyyy-MM-dd")));if(!r.Success){ShowError(r);return;}Status=r.Data?.Data?.KycStatus??"submitted";SuccessMessage="KYC submitted for review.";}finally{IsBusy=false;}}
}
public sealed class ApiEnvelope<T>{public bool Status{get;set;}public T? Data{get;set;}public string? Message{get;set;}}
