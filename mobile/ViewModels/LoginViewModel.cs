using CommunityToolkit.Mvvm.Input;
using UBee.App.Services;

namespace UBee.App.ViewModels;
public partial class LoginViewModel : ViewModelBase
{
    private readonly IAuthService _auth;
    public LoginViewModel(IAuthService auth) => _auth = auth;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string email = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string password = "";
    [RelayCommand]
    private async Task LoginAsync()
    {
        ClearMessages();
        if (string.IsNullOrWhiteSpace(Email) || string.IsNullOrWhiteSpace(Password)) { ErrorMessage = "Enter your email and password."; return; }
        if (IsBusy) return; IsBusy = true;
        try
        {
            var result = await _auth.LoginAsync(Email.Trim(), Password);
            if (!result.Success) { ShowError(result); return; }
            if (result.Data!.MfaRequired)
            {
                await Shell.Current.GoToAsync($"verify-otp?challengeId={Uri.EscapeDataString(result.Data.ChallengeId ?? "")}");
                return;
            }
            await Shell.Current.GoToAsync("//main/dashboard");
        }
        finally { IsBusy = false; }
    }
    [RelayCommand] private Task GoRegisterAsync() => Shell.Current.GoToAsync("//register");
    [RelayCommand] private Task GoForgotAsync() => Shell.Current.GoToAsync("//forgot-password");
}
