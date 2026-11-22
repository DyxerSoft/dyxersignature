FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY DyxerSignature.slnx ./
COPY src/DyxerSignature.Api/DyxerSignature.Api.csproj src/DyxerSignature.Api/
RUN dotnet restore DyxerSignature.slnx

COPY src/DyxerSignature.Api/ src/DyxerSignature.Api/
RUN dotnet publish src/DyxerSignature.Api/DyxerSignature.Api.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Development

EXPOSE 8080
ENTRYPOINT ["dotnet", "DyxerSignature.Api.dll"]
