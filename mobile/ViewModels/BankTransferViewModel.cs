using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using UBee.App.Models;
using UBee.App.Services;
namespace UBee.App.ViewModels;

/// <summary>
/// "Transfer to Bank Account": pick a bank + account number, we look up the
/// holder's name, then amount -> review -> confirm. The server does its own
/// name check, applies the fee (3 free per day, then a flat fee) and the tier
/// limits, and refunds automatically if the bank rejects the transfer.
/// </summary>
public partial class BankTransferViewModel : ViewModelBase
{
    private readonly IApiClient _api; private readonly IBeneficiaryService _fav;
    // One key per logical attempt: if a request times out and the user taps again, the
    // server sees the SAME key and returns the original result instead of paying twice.
    private string? _attemptKey;
    private bool _balanceLoaded;

    public BankTransferViewModel(IApiClient api, IBeneficiaryService fav) { _api = api; _fav = fav; }

    public ObservableCollection<BankDto> Banks { get; } = [];
    public ObservableCollection<RecipientItem> Recents { get; } = [];
    public ObservableCollection<RecipientItem> Favourites { get; } = [];

    [ObservableProperty] private string accountNumber = "";
    [ObservableProperty] private BankDto? selectedBank;
    [ObservableProperty] private decimal amount;
    [ObservableProperty] private string description = "";
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
    [ObservableProperty] private bool showConfirmation;
    [ObservableProperty, NotifyPropertyChangedFor(nameof(CanConfirm))] private bool submitting;
    [ObservableProperty, NotifyPropertyChangedFor(nameof(CanConfirm))] private string pin = "";
    [ObservableProperty] private decimal balance;
    [ObservableProperty] private BankTransferConfigDto config = new() { Fee = 10, FreePerDay = 3, FreeRemaining = 3, MinAmount = 100 };

    public bool CanConfirm => PinRules.IsValidShape(Pin) && !Submitting;
    public bool IsStep1 => Step == 1;
    public bool IsStep2 => Step == 2;
    public bool ShowFavourites => !ShowRecents;
    public bool CanContinue => RecipientVerified;
    public bool HasLookupError => !string.IsNullOrWhiteSpace(LookupError);
    public bool TestMode => Config.TestMode;
    public decimal FeeToCharge => Config.FreeRemaining > 0 ? 0 : Config.Fee;
    public string FeeText => FeeToCharge == 0
        ? $"Free · {Config.FreeRemaining} of {Config.FreePerDay} free transfers left today"
        : $"Fee ₦{Config.Fee:N0} per transfer · your {Config.FreePerDay} free transfers today are used";
    public string ConfirmAmount => $"₦{Amount:N2}";
    public string ConfirmFee => FeeToCharge == 0 ? "Free" : $"₦{FeeToCharge:N2}";
    public string ConfirmTotal => $"₦{Amount + FeeToCharge:N2}";
    public string DisplayBalance => $"₦{Balance:N2}";
    public string BankName => SelectedBank?.Name ?? "";

    partial void OnConfigChanged(BankTransferConfigDto value) { OnPropertyChanged(nameof(TestMode)); OnPropertyChanged(nameof(FeeToCharge)); OnPropertyChanged(nameof(FeeText)); OnPropertyChanged(nameof(ConfirmFee)); OnPropertyChanged(nameof(ConfirmTotal)); }
    partial void OnAmountChanged(decimal value) { _attemptKey = null; OnPropertyChanged(nameof(ConfirmAmount)); OnPropertyChanged(nameof(ConfirmTotal)); }
    partial void OnDescriptionChanged(string value) => _attemptKey = null;
    partial void OnBalanceChanged(decimal value) => OnPropertyChanged(nameof(DisplayBalance));
    partial void OnAccountNumberChanged(string value) { _attemptKey = null; ResetVerification(); TryLookup(); }
    partial void OnSelectedBankChanged(BankDto? value) { _attemptKey = null; OnPropertyChanged(nameof(BankName)); ResetVerification(); TryLookup(); }

    private void ResetVerification() { RecipientVerified = false; RecipientName = ""; LookupError = null; LookingUp = false; AlreadyFavourite = false; }

    private void TryLookup()
    {
        if (SelectedBank is null || AccountNumber.Length != 10 || !AccountNumber.All(char.IsAsciiDigit)) return;
        _ = LookupAsync(AccountNumber, SelectedBank);
    }

    private async Task LookupAsync(string account, BankDto bank)
    {
        LookingUp = true;
        try
        {
            var r = await _api.GetAsync<ApiEnvelope<NameEnquiryDto>>($"bank-transfers/name-enquiry?accountNumber={account}&bankCode={Uri.EscapeDataString(bank.Code)}");
            if (AccountNumber != account || SelectedBank?.Code != bank.Code) return; // inputs changed while we were asking
            LookingUp = false;
            if (!r.Success) { LookupError = r.Error?.StatusCode == 404 ? "Account not found. Check the number and the bank." : r.Error?.Message ?? "Could not verify this account."; return; }
            var name = r.Data?.Data?.AccountName;
            if (string.IsNullOrWhiteSpace(name)) { LookupError = "Could not verify this account."; return; }
            RecipientName = name!;
            AlreadyFavourite = Favourites.Any(f => f.AccountNumber == account && f.BankName == bank.Name);
            RecipientVerified = true;
        }
        catch { if (AccountNumber == account) { LookingUp = false; LookupError = "Could not verify this account."; } }
    }

    [RelayCommand] public async Task LoadAsync()
    {
        var cfg = await _api.GetAsync<ApiEnvelope<BankTransferConfigDto>>("bank-transfers/config");
        if (cfg.Success && cfg.Data?.Data is { } c) Config = c;

        if (Banks.Count == 0)
        {
            var banks = await _api.GetAsync<ApiEnvelope<List<BankDto>>>("bank-transfers/banks");
            if (banks.Success) foreach (var b in (banks.Data?.Data ?? []).OrderBy(b => b.Name)) Banks.Add(b);
        }

        var w = await _api.GetAsync<WalletEnvelope>("wallet");
        if (w.Success && w.Data?.Data is not null) { Balance = w.Data.Data.Balance; _balanceLoaded = true; }

        Favourites.Clear();
        foreach (var f in (await _fav.GetAllAsync()).Where(f => !string.IsNullOrWhiteSpace(f.Bank) && f.Bank != "U-BEE"))
            Favourites.Add(new RecipientItem { Name = f.Name, AccountNumber = f.AccountNumber, BankName = f.Bank });
        HasFavourites = Favourites.Count > 0;

        Recents.Clear();
        var t = await _api.GetAsync<TransactionPageDto>("transaction?limit=50");
        if (t.Success)
        {
            var seen = new HashSet<string>();
            foreach (var x in t.Data?.Data ?? [])
            {
                if (x.IsCredit || string.IsNullOrWhiteSpace(x.Bank) || x.Bank == "U-BEE" || string.IsNullOrWhiteSpace(x.AccountNumber)) continue;
                if (!seen.Add($"{x.Bank}|{x.AccountNumber}")) continue;
                Recents.Add(new RecipientItem { Name = x.RecipientName is { Length: > 0 } n ? n : x.AccountNumber!, AccountNumber = x.AccountNumber!, BankName = x.Bank! });
                if (Recents.Count == 5) break;
            }
        }
        HasRecents = Recents.Count > 0;
    }

    [RelayCommand] private void ShowRecentsTab() => ShowRecents = true;
    [RelayCommand] private void ShowFavouritesTab() => ShowRecents = false;
    [RelayCommand] private void SelectRecipient(RecipientItem item)
    {
        if (item is null) return; ClearMessages(); Step = 1;
        SelectedBank = Banks.FirstOrDefault(b => b.Name == item.BankName); // set bank first, then the number triggers the lookup
        AccountNumber = item.AccountNumber;
        if (SelectedBank is not null && AccountNumber.Length == 10) TryLookup();
    }
    [RelayCommand] private void Next() { if (!RecipientVerified) return; ClearMessages(); Step = 2; }
    [RelayCommand] private void Back() { Pin = ""; ShowConfirmation = false; ClearMessages(); Step = 1; }

    [RelayCommand] private Task ReviewAsync()
    {
        ClearMessages();
        if (!RecipientVerified || SelectedBank is null) { ErrorMessage = "Verify the recipient first."; return Task.CompletedTask; }
        if (Amount != decimal.Truncate(Amount)) { ErrorMessage = "Enter a whole-naira amount."; return Task.CompletedTask; }
        if (Amount < Config.MinAmount) { ErrorMessage = $"The minimum bank transfer is ₦{Config.MinAmount:N0}."; return Task.CompletedTask; }
        if (_balanceLoaded && Amount + FeeToCharge > Balance) { ErrorMessage = $"Insufficient balance. You have {DisplayBalance}."; return Task.CompletedTask; }
        ShowConfirmation = true; return Task.CompletedTask;
    }
    [RelayCommand] private void CancelReview() { Pin = ""; ShowConfirmation = false; }

    [RelayCommand] private async Task SubmitAsync()
    {
        if (Submitting || SelectedBank is null) return; ClearMessages(); Submitting = true;
        try
        {
            var key = _attemptKey ??= Guid.NewGuid().ToString("N");
            var r = await _api.PostAsync<BankTransferRequest, ApiEnvelope<BankTransferResultDto>>("bank-transfers",
                new BankTransferRequest(AccountNumber, SelectedBank.Code, (long)Amount, string.IsNullOrWhiteSpace(Description) ? null : Description.Trim(), key, Pin), idempotencyKey: key);

            if (!r.Success)
            {
                ShowError(r);
                var wrongPin = ErrorMessage?.Contains("PIN", StringComparison.OrdinalIgnoreCase) == true;
                if (!wrongPin) ShowConfirmation = false; // a wrong PIN keeps the card open so it can be retyped
                Pin = "";
                // The server answered (it refused): this attempt is over, a retry is a new one.
                // No answer at all (network drop/timeout): keep the key so a retry can't pay twice.
                if (r.Error?.StatusCode is not null) _attemptKey = null;
                else ErrorMessage = "We couldn't confirm whether the transfer went through. Check History before trying again - if you retry, you will not be charged twice.";
                return;
            }

            var d = r.Data?.Data;
            var processing = d?.Status != "success";
            var sentTo = RecipientName; var sentAmount = ConfirmAmount; var bank = SelectedBank;
            if (SaveAsFavourite && !AlreadyFavourite) await _fav.AddAsync(new BeneficiaryDto { Name = sentTo, AccountNumber = AccountNumber, Bank = bank.Name });

            Pin = ""; _attemptKey = null; ShowConfirmation = false; SaveAsFavourite = false; Amount = 0; Description = "";
            AccountNumber = ""; SelectedBank = null; Step = 1;
            SuccessMessage = processing ? $"{sentAmount} to {sentTo} is being processed. We'll update History when the bank confirms." : $"{sentAmount} sent to {sentTo} ({bank.Name}).";
            await LoadAsync();
        }
        finally { Submitting = false; }
    }
}
