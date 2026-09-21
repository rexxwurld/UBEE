using CommunityToolkit.Mvvm.Input;
using UBee.App.Models;
using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class ForgotPasswordViewModel : ViewModelBase
{
    private readonly IApiClient _api;
    public ForgotPasswordViewModel(IApiClient api) => _api = api;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string email = "";
    [RelayCommand] private async Task SendOtpAsync()
    {
        ClearMessages(); if (string.IsNullOrWhiteSpace(Email)) { ErrorMessage = "Enter your email address."; return; }
        IsBusy = true;
        try
        {
            var r = await _api.PostAsync<object, object>("auth/forgot-password", new { email = Email.Trim() });
            if (!r.Success) { ShowError(r); return; }
            SuccessMessage = "If that email is registered, a reset code has been sent.";
            await Shell.Current.GoToAsync($"reset-password?email={Uri.EscapeDataString(Email.Trim())}");
        } finally { IsBusy = false; }
    }
    [RelayCommand] private Task GoLoginAsync() => Shell.Current.GoToAsync("//login");
}
