using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using UBee.App.Models;

namespace UBee.App.ViewModels;

public abstract partial class ViewModelBase : ObservableObject
{

    [ObservableProperty] private bool isBusy;

[ObservableProperty]
[NotifyPropertyChangedFor(nameof(HasError))]
private string? errorMessage;

[ObservableProperty]
[NotifyPropertyChangedFor(nameof(HasSuccess))]
private string? successMessage;
    public bool HasError => !string.IsNullOrWhiteSpace(ErrorMessage);
    public bool HasSuccess => !string.IsNullOrWhiteSpace(SuccessMessage);
    protected void ClearMessages() { ErrorMessage = null; SuccessMessage = null; }
    protected void ShowError<T>(ApiResult<T> result) { ErrorMessage = result.Error?.Message ?? "Something went wrong."; }
}
