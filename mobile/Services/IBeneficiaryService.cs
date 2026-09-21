using UBee.App.Models;
namespace UBee.App.Services;
public interface IBeneficiaryService
{
    Task<IReadOnlyList<BeneficiaryDto>> GetAllAsync();
    Task AddAsync(BeneficiaryDto item);
    Task RemoveAsync(string id);
}
