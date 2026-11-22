FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/DyxerSignature.slnx backend/
COPY backend/src/DyxerSignature.Api/DyxerSignature.Api.csproj backend/src/DyxerSignature.Api/
COPY backend/tests/DyxerSignature.Api.Tests/DyxerSignature.Api.Tests.csproj backend/tests/DyxerSignature.Api.Tests/
RUN dotnet restore backend/DyxerSignature.slnx
COPY backend/ backend/
RUN dotnet publish backend/src/DyxerSignature.Api/DyxerSignature.Api.csproj \
    --configuration Release --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
# dotnet publish can preserve restrictive file modes (0600) from the build
# environment. Own the runtime files with the non-root ASP.NET Core user.
COPY --from=build --chown=app:app /app/publish/ ./
USER $APP_UID
# Fail the image build if runtime settings cannot be opened by APP_UID.
RUN test -r /app/appsettings.Development.json && test -r /app/appsettings.json
ENTRYPOINT ["dotnet", "DyxerSignature.Api.dll"]
