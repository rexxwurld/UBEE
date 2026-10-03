using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using UBee.App.Models;
using UBee.App.Services;
namespace UBee.App.ViewModels;

/// <summary>
/// Two-step U-BEE transfer, mirroring the OPay flow:
///   1. Recipient: type/pick an account number -> name is looked up and shown -> Next
///   2. Amount: amount + note -> Review -> Confirm &amp; Send
/// Money only moves in the final Confirm step (same idempotent request as before).
/// Transfers are U-BEE to U-BEE only: the backend rejects other-bank transfers.
/// </summary>
public partial class TransferViewModel : ViewModelBase
{
    private readonly IApiClient _api; private readonly IBeneficiaryService _fav;
    private bool _balanceLoaded;
    public TransferViewModel(IApiClient api, IBeneficiaryService fav) { _api = api; _fav = fav; }

    public ObservableCollection<RecipientItem> Recents { get; } = [];
    public ObservableCollection<RecipientItem> Favourites { get; } = [];

    [ObservableProperty] private string accountNumber = "";
    [ObservableProperty] private string bank = "";
    [ObservableProperty] private decimal amount;
    [ObservableProperty] private string description = "";
    [ObservableProperty] private bool showConfirmation;
    [ObservableProperty, NotifyPropertyChangedFor(nameof(CanConfirm))] private bool submitting;
    [ObservableProperty, NotifyPropertyChangedFor(nameof(CanConfirm))] private string pin = "";
    [ObservableProperty] private string recipientName = "";
    [ObservableProperty, NotifyPropertyChangedFor(nameof(CanContinue))] private bool recipientVerified;
    [ObservableProperty] private bool lookingUp;
    [ObservableProperty, NotifyPropertyChangedFor(nameof(HasLookupError))] private string? lookupError;
    [ObservableProperty, NotifyPropertyChangedFor(nameof(IsStep1)), NotifyPropertyChangedFor(nameof(IsStep2))] private int step = 1;
    [ObservableProperty, NotifyPropertyChangedFor(nameof(ShowFavourites))] private bool showRecents = true;
    [ObservableProperty] private bool hasRecents;
    [ObservableProperty] private bool hasFavourites;
    [ObservableProperty] private bool saveAsFavourite;
    [ObservableProperty] private bool alreadyFavourite;
    [ObservableProperty] private decimal balance;

    public bool CanConfirm => PinRules.IsValidShape(Pin) && !Submitting;
    public bool IsStep1 => Step == 1;
    public bool IsStep2 => Step == 2;
    public bool ShowFavourites => !ShowRecents;
    public bool CanContinue => RecipientVerified;
    public bool HasLookupError => !string.IsNullOrWhiteSpace(LookupError);
    public string ConfirmAmount => $"₦{Amount:N2}";
    public string DisplayBalance => $"₦{Balance:N2}";
    partial void OnAmountChanged(decimal value) => OnPropertyChanged(nameof(ConfirmAmount));
    partial void OnBalanceChanged(decimal value) => OnPropertyChanged(nameof(DisplayBalance));

    partial void OnAccountNumberChanged(string value)
    {
        var typed = value ?? "";
        // Pasted/typed as a phone number (08160135713, +234...)? The account number is the 10-digit form.
        if (typed.Length > 10 && PhoneFormatter.ToNational(typed) is { } national && national != typed) { AccountNumber = national; return; }
        ResetVerification();
        if (typed.Length == 10 && typed.All(char.IsAsciiDigit)) _ = LookupAsync(typed);
    }

    private void ResetVerification() { RecipientVerified = false; RecipientName = ""; LookupError = null; LookingUp = false; AlreadyFavourite = false; }

    private async Task LookupAsync(string account)
    {
        LookingUp = true;
        try
        {
            var r = await _api.GetAsync<ApiEnvelope<LookupDto>>($"wallet/lookup/{account}");
            if (AccountNumber != account) return; // user changed the number while we were asking
            LookingUp = false;
            if (!r.Success)
            {
                LookupError = r.Error?.StatusCode == 404 ? "Account not found. Check the number and try again." : r.Error?.Message ?? "Could not verify this account.";
                return;
            }
            var d = r.Data?.Data;
            if (d is null || string.IsNullOrWhiteSpace(d.Fullname)) { LookupError = "Could not verify this account."; return; }
            if (d.IsSelf) { LookupError = "You can't send money to your own account."; return; }
            RecipientName = d.Fullname!;
            AlreadyFavourite = Favourites.Any(f => f.AccountNumber == account);
            RecipientVerified = true;
        }
        catch { if (AccountNumber == account) { LookingUp = false; LookupError = "Could not verify this account."; } }
    }

    [RelayCommand] public async Task LoadAsync()
    {
        var w = await _api.GetAsync<WalletEnvelope>("wallet");
        if (w.Success && w.Data?.Data is not null) { Balance = w.Data.Data.Balance; _balanceLoaded = true; }

        Favourites.Clear();
        foreach (var f in (await _fav.GetAllAsync()).Where(f => string.IsNullOrWhiteSpace(f.Bank) || f.Bank == "U-BEE")) Favourites.Add(new RecipientItem { Name = f.Name, AccountNumber = f.AccountNumber });
        HasFavourites = Favourites.Count > 0;

        Recents.Clear();
        var t = await _api.GetAsync<TransactionPageDto>("transaction?limit=50");
        if (t.Success)
        {
            var seen = new HashSet<string>();
            foreach (var x in t.Data?.Data ?? [])
            {
                if (x.IsCredit || !string.IsNullOrWhiteSpace(x.Bank) || string.IsNullOrWhiteSpace(x.AccountNumber) || !seen.Add(x.AccountNumber!)) continue;
                Recents.Add(new RecipientItem { Name = x.Receiver?.Fullname ?? x.AccountNumber!, AccountNumber = x.AccountNumber! });
                if (Recents.Count == 5) break;
            }
        }
        HasRecents = Recents.Count > 0;
    }

    [RelayCommand] private Task GoBankAsync() => Shell.Current.GoToAsync("transfer-bank");
    [RelayCommand] private void ShowRecentsTab() => ShowRecents = true;
    [RelayCommand] private void ShowFavouritesTab() => ShowRecents = false;
    [RelayCommand] private void SelectRecipient(RecipientItem item) { if (item is null) return; ClearMessages(); Step = 1; AccountNumber = item.AccountNumber; }
    [RelayCommand] private void Next() { if (!RecipientVerified) return; ClearMessages(); Step = 2; }
    [RelayCommand] private void Back() { Pin = ""; ShowConfirmation = false; ClearMessages(); Step = 1; }

    [RelayCommand] private Task ReviewAsync()
    {
        ClearMessages();
        if (!RecipientVerified) { ErrorMessage = "Verify the recipient first."; return Task.CompletedTask; }
        if (Amount <= 0) { ErrorMessage = "Enter an amount to send."; return Task.CompletedTask; }
        if (_balanceLoaded && Amount > Balance) { ErrorMessage = $"Insufficient balance. You have {DisplayBalance}."; return Task.CompletedTask; }
        ShowConfirmation = true; return Task.CompletedTask;
    }
    [RelayCommand] private void CancelReview() { Pin = ""; ShowConfirmation = false; }

    [RelayCommand] private async Task SubmitAsync()
    {
        if (Submitting) return; ClearMessages(); Submitting = true;
        try
        {
            var key = Guid.NewGuid().ToString("N");
            var r = await _api.PostAsync<TransferRequest, TransferResponse>("transaction/transfer",
                new TransferRequest(AccountNumber.Trim(), Amount, string.IsNullOrWhiteSpace(Description) ? null : Description.Trim(), string.IsNullOrWhiteSpace(Bank) ? null : Bank.Trim(), key, Pin), idempotencyKey: key);
            if (!r.Success)
            {
                ShowError(r);
                // A wrong PIN keeps the confirm card open so it can simply be retyped.
                if (ErrorMessage?.Contains("PIN", StringComparison.OrdinalIgnoreCase) != true) ShowConfirmation = false;
                Pin = "";
                return;
            }

            var sentTo = RecipientName; var sentAmount = ConfirmAmount; var account = AccountNumber;
            if (SaveAsFavourite && !AlreadyFavourite) await _fav.AddAsync(new BeneficiaryDto { Name = sentTo, AccountNumber = account, Bank = "U-BEE" });

            Pin = ""; ShowConfirmation = false; SaveAsFavourite = false; Amount = 0; Description = ""; Bank = "";
            AccountNumber = ""; Step = 1;
            SuccessMessage = $"{sentAmount} sent to {sentTo}.";
            await LoadAsync();
        }
        finally { Submitting = false; }
    }
}
