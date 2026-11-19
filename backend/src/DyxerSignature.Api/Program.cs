using DyxerSignature.Api.Infrastructure.Outbox;
using DyxerSignature.Api.Infrastructure.Persistence;
using DyxerSignature.Api.Modules.Blockchain.Application;
using DyxerSignature.Api.Modules.Blockchain.Infrastructure;
using DyxerSignature.Api.Modules.Documents.Application;
using DyxerSignature.Api.Modules.Documents.Infrastructure;
using DyxerSignature.Api.Modules.Evidence.Application;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("Postgres")
        ?? throw new InvalidOperationException("Connection string 'Postgres' is required.")));

builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.Configure<BlockchainOptions>(builder.Configuration.GetSection("Blockchain"));

builder.Services.AddScoped<IDocumentStorage, LocalDocumentStorage>();
builder.Services.AddSingleton<DocumentIntegrityService>();
builder.Services.AddSingleton<EvidenceManifestBuilder>();

var blockchainMode = builder.Configuration["Blockchain:Mode"] ?? "Simulated";

if (blockchainMode.Equals("Rpc", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddSingleton<IBlockchainGateway, NethereumBlockchainGateway>();
else
    builder.Services.AddSingleton<IBlockchainGateway, SimulatedBlockchainGateway>();

builder.Services.AddHostedService<BlockchainOutboxWorker>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();

if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();
}

app.MapHealthChecks("/api/v1/health");
app.MapControllers();

app.Run();

public partial class Program;
