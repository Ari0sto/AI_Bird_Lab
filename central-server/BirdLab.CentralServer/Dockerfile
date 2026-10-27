# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src

# Restore dependencies
COPY central-server/BirdLab.CentralServer/*.csproj ./BirdLab.CentralServer/

RUN dotnet restore BirdLab.CentralServer/BirdLab.CentralServer.csproj

# Copy source code
COPY central-server/BirdLab.CentralServer/ ./BirdLab.CentralServer/

# Publish application
RUN dotnet publish BirdLab.CentralServer/BirdLab.CentralServer.csproj \
    -c Release \
    -o /app/publish \
    --no-restore


# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0

WORKDIR /app

# Copy published application
COPY --from=build /app/publish .

# Server configuration
ENV ASPNETCORE_URLS=http://0.0.0.0:5000

EXPOSE 5000

# Start Central Server
ENTRYPOINT ["dotnet", "BirdLab.CentralServer.dll"]