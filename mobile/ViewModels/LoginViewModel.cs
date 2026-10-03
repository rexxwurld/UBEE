using CommunityToolkit.Mvvm.Input;
using UBee.App.Services;

namespace UBee.App.ViewModels;
public partial class LoginViewModel : ViewModelBase
{
    private readonly IAuthService _auth;
    public LoginViewModel(IAuthService auth) => _auth = auth;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string phone = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string pin = "";
    [RelayCommand]
    private async Task LoginAsync()
    {
        ClearMessages();
        var local = PhoneFormatter.ToLocal(Phone);
        if (local is null) { ErrorMessage = "Enter a valid phone number."; return; }
        if (!PinRules.IsValidShape(Pin)) { ErrorMessage = $"Enter your {PinRules.Length}-digit PIN."; return; }
        if (IsBusy) return; IsBusy = true;
        try
        {
            var result = await _auth.LoginAsync(local, Pin);
            if (!result.Success) { ShowError(result); return; }
            Pin = "";
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
