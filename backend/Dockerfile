FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/DyxerSignature.slnx backend/
COPY backend/src/DyxerSignature.Api/DyxerSignature.Api.csproj backend/src/DyxerSignature.Api/
RUN dotnet restore backend/DyxerSignature.slnx
COPY backend/ backend/
RUN dotnet publish backend/src/DyxerSignature.Api/DyxerSignature.Api.csproj \
    --configuration Release --no-restore --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "DyxerSignature.Api.dll"]
