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
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string pin = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string confirmPin = "";

    // Live preview: the account number is the phone number without the leading 0.
    public string AccountNumberPreview => PhoneFormatter.ToNational(Phone) is { } n ? $"Your account number will be {n}" : "";
    public bool HasAccountNumberPreview => PhoneFormatter.ToNational(Phone) is not null;
    partial void OnPhoneChanged(string value) { OnPropertyChanged(nameof(AccountNumberPreview)); OnPropertyChanged(nameof(HasAccountNumberPreview)); }

    [RelayCommand] private async Task RegisterAsync()
    {
        ClearMessages();
        if (string.IsNullOrWhiteSpace(Fullname) || string.IsNullOrWhiteSpace(Email) || string.IsNullOrWhiteSpace(Phone) || string.IsNullOrWhiteSpace(Pin)) { ErrorMessage = "Complete all required fields."; return; }
        var local = PhoneFormatter.ToLocal(Phone);
        if (local is null) { ErrorMessage = "Enter a valid Nigerian phone number."; return; }
        if (!PinRules.IsValidShape(Pin)) { ErrorMessage = $"PIN must be exactly {PinRules.Length} digits."; return; }
        if (PinRules.IsWeak(Pin)) { ErrorMessage = "That PIN is too easy to guess. Avoid repeats like 111111 or sequences like 123456."; return; }
        if (Pin != ConfirmPin) { ErrorMessage = "PINs do not match."; return; }
        if (IsBusy) return; IsBusy = true;
        try
        {
            var result = await _auth.RegisterAsync(new RegisterRequest(Fullname.Trim(), Email.Trim(), local, Pin));
            if (!result.Success) { ShowError(result); return; }
            SuccessMessage = $"Account created. Your account number is {PhoneFormatter.ToNational(Phone)}.";
            await Task.Delay(1200);
            await Shell.Current.GoToAsync("//login");
        }
        finally { IsBusy = false; }
    }
    [RelayCommand] private Task GoLoginAsync() => Shell.Current.GoToAsync("//login");
}
