namespace DyxerSignature.Api.Modules.Blockchain.Infrastructure;

public sealed class BlockchainOptions
{
    public string Mode { get; init; } = "Simulated";
    public string Network { get; init; } = "Local";
    public long ChainId { get; init; } = 31337;
    public string RpcUrl { get; init; } = "http://127.0.0.1:8545";
    public string ContractAddress { get; init; } = "";
    public string PrivateKey { get; init; } = "";
    public int RequiredConfirmations { get; init; } = 1;
}
