using CommunityToolkit.Mvvm.Input;
namespace UBee.App.ViewModels;
public partial class NotificationsViewModel:ViewModelBase
{
 [RelayCommand] public Task LoadAsync(){return Task.CompletedTask;}
}
