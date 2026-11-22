using DyxerSignature.Api.Infrastructure.Outbox;
using DyxerSignature.Api.Infrastructure.Persistence;
using DyxerSignature.Api.Modules.Blockchain.Application;
using DyxerSignature.Api.Modules.Blockchain.Infrastructure;
using DyxerSignature.Api.Modules.Documents.Application;
using DyxerSignature.Api.Modules.Documents.Infrastructure;
using DyxerSignature.Api.Modules.Evidence.Application;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(options => options.IncludeScopes = true);
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("Postgres")
        ?? throw new InvalidOperationException("Connection string 'Postgres' is required.")));

builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.Configure<BlockchainOptions>(builder.Configuration.GetSection("Blockchain"));

builder.Services.AddSingleton<IDocumentStorage, S3DocumentStorage>();
builder.Services.AddSingleton<DocumentIntegrityService>();
builder.Services.AddSingleton<EvidenceManifestBuilder>();

var signingKey = builder.Configuration["Authentication:JwtSigningKey"];
if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
    throw new InvalidOperationException("Authentication:JwtSigningKey must be supplied externally and contain at least 32 bytes.");

var issuer = builder.Configuration["Authentication:Issuer"] ?? "DyxerSignature";
var audience = builder.Configuration["Authentication:Audience"] ?? "DyxerSignature.Client";
var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = issuer,
            ValidateAudience = true,
            ValidAudience = audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = securityKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
builder.Services.AddAuthorization();

var blockchainMode = builder.Configuration["Blockchain:Mode"] ?? "Simulated";

if (blockchainMode.Equals("Rpc", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddSingleton<IBlockchainGateway, NethereumBlockchainGateway>();
else
    builder.Services.AddSingleton<IBlockchainGateway, SimulatedBlockchainGateway>();

builder.Services.AddHostedService<BlockchainOutboxWorker>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();
app.UseSwagger();
app.UseSwaggerUI();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

app.MapHealthChecks("/api/v1/health");
app.MapControllers();

app.Run();

public partial class Program;
