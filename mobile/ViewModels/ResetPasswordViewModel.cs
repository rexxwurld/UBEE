using CommunityToolkit.Mvvm.Input;
using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class ResetPasswordViewModel : ViewModelBase, IQueryAttributable
{
    private readonly IApiClient _api; public ResetPasswordViewModel(IApiClient api) => _api = api;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string phone = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string otp = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string newPin = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string confirmPin = "";
    public void ApplyQueryAttributes(IDictionary<string, object> query) { if (query.TryGetValue("phone", out var p)) Phone = Uri.UnescapeDataString(p?.ToString() ?? ""); }
    [RelayCommand] private async Task ResetAsync()
    {
        ClearMessages();
        if (Otp.Length != 6 || !Otp.All(char.IsAsciiDigit)) { ErrorMessage = "Enter the 6-digit code that was sent to you."; return; }
        if (!PinRules.IsValidShape(NewPin)) { ErrorMessage = $"PIN must be exactly {PinRules.Length} digits."; return; }
        if (PinRules.IsWeak(NewPin)) { ErrorMessage = "That PIN is too easy to guess. Avoid repeats like 111111 or sequences like 123456."; return; }
        if (NewPin != ConfirmPin) { ErrorMessage = "PINs do not match."; return; }
        var local = PhoneFormatter.ToLocal(Phone);
        if (local is null) { ErrorMessage = "Phone number is missing. Go back and start again."; return; }
        IsBusy = true;
        try
        {
            var r = await _api.PostAsync<object, object>("auth/reset-password", new { phone = local, otp = Otp.Trim(), pin = NewPin });
            if (!r.Success) { ShowError(r); return; }
            SuccessMessage = "PIN reset complete.";
            await Task.Delay(700);
            await Shell.Current.GoToAsync("//login");
        } finally { IsBusy = false; }
    }
    [RelayCommand] private Task GoLoginAsync() => Shell.Current.GoToAsync("//login");
}
