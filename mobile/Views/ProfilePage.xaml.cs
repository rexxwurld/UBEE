using UBee.App.ViewModels;
namespace UBee.App.Views;
public partial class ProfilePage : ContentPage
{
    private readonly ProfileViewModel _vm;
    public ProfilePage(ProfileViewModel vm) { InitializeComponent(); _vm = vm; BindingContext = vm; }
    protected override async void OnAppearing() { base.OnAppearing(); await _vm.LoadAsync(); }
}
