using CommunityToolkit.Mvvm.Input;
using UBee.App.Models;
using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class ForgotPasswordViewModel : ViewModelBase
{
    private readonly IApiClient _api;
    public ForgotPasswordViewModel(IApiClient api) => _api = api;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string phone = "";
    [RelayCommand] private async Task SendOtpAsync()
    {
        ClearMessages();
        var local = PhoneFormatter.ToLocal(Phone);
        if (local is null) { ErrorMessage = "Enter a valid phone number."; return; }
        IsBusy = true;
        try
        {
            var r = await _api.PostAsync<object, object>("auth/forgot-password", new { phone = local });
            if (!r.Success) { ShowError(r); return; }
            SuccessMessage = "If that phone number is registered, a reset code has been sent.";
            await Shell.Current.GoToAsync($"reset-password?phone={Uri.EscapeDataString(local)}");
        } finally { IsBusy = false; }
    }
    [RelayCommand] private Task GoLoginAsync() => Shell.Current.GoToAsync("//login");
}
