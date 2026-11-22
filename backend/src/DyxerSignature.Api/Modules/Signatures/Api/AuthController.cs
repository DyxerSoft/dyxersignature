using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace DyxerSignature.Api.Modules.Signatures.Api;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(
    IWebHostEnvironment environment,
    IConfiguration configuration) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("dev-token")]
    public ActionResult<object> CreateDevelopmentToken()
    {
        if (!environment.IsDevelopment())
            return NotFound();

        var signingKey = configuration["Authentication:JwtSigningKey"];
        if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
            return Problem("Configure Authentication:JwtSigningKey with at least 32 bytes.");

        var issuer = configuration["Authentication:Issuer"] ?? "DyxerSignature";
        var audience = configuration["Authentication:Audience"] ?? "DyxerSignature.Client";
        var issuedAt = DateTime.UtcNow;
        var expiresAt = issuedAt.AddHours(8);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, "demo-user"),
            new Claim(JwtRegisteredClaimNames.Email, "demo@dyxer.local"),
            new Claim(ClaimTypes.Name, "Demo User"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            issuedAt,
            expiresAt,
            new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
                SecurityAlgorithms.HmacSha256));

        return Ok(new
        {
            accessToken = new JwtSecurityTokenHandler().WriteToken(token),
            tokenType = "Bearer",
            expiresAtUtc = expiresAt
        });
    }
}
