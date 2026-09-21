using CommunityToolkit.Mvvm.Input;
using UBee.App.Models;
using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class RegisterViewModel : ViewModelBase
{
    private readonly IAuthService _auth;
    public RegisterViewModel(IAuthService auth) => _auth = auth;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string fullname = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string email = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string phone = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string password = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string confirmPassword = "";
    [RelayCommand] private async Task RegisterAsync()
    {
        ClearMessages();
        if (string.IsNullOrWhiteSpace(Fullname) || string.IsNullOrWhiteSpace(Email) || string.IsNullOrWhiteSpace(Phone) || string.IsNullOrWhiteSpace(Password)) { ErrorMessage = "Complete all required fields."; return; }
        if (Password != ConfirmPassword) { ErrorMessage = "Passwords do not match."; return; }
        if (Password.Length < 8) { ErrorMessage = "Password must be at least 8 characters."; return; }
        IsBusy = true;
        try
        {
            var result = await _auth.RegisterAsync(new RegisterRequest(Fullname.Trim(), Email.Trim(), Phone.Trim().TrimStart('+'), Password));
            if (!result.Success) { ShowError(result); return; }
            SuccessMessage = "Account created. You can now sign in.";
            await Task.Delay(700);
            await Shell.Current.GoToAsync("//login");
        }
        finally { IsBusy = false; }
    }
    [RelayCommand] private Task GoLoginAsync() => Shell.Current.GoToAsync("//login");
}
