namespace DyxerSignature.Api.Modules.Blockchain.Infrastructure;

public sealed class StellarOptions
{
    public string Network { get; init; } = "Testnet";
    public string HorizonUrl { get; init; } = "https://horizon-testnet.stellar.org";
    public string SecretSeed { get; init; } = "";
    public string PublicKey { get; init; } = "";
}
