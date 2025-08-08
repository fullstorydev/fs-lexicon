// Terraform Blueprint for Lexicon Service on Google Cloud Run
// This is a clean template for deploying Lexicon service with MCP support
// Customize the project IDs, service account names, and other values for your environment

//============================================================================
// DATA SOURCES
//============================================================================

data "google_project" "current" {}

//============================================================================
// SERVICE ACCOUNTS
//============================================================================

// Service Account for Lexicon Cloud Run services
resource "google_service_account" "lexicon_runner" {
  account_id   = "lexicon-runner"
  display_name = "Lexicon Service Runner"
  description  = "Service account for running Lexicon Cloud Run services"
}

// Grant Cloud Run Invoker to the main Lexicon service
resource "google_cloud_run_v2_service_iam_member" "lexicon_runner" {
  name   = google_cloud_run_v2_service.lexicon.name
  role   = "roles/run.invoker"
  member = "serviceAccount:${google_service_account.lexicon_runner.email}"
}


//============================================================================
// CLOUD RUN SERVICES
//============================================================================

// Main Lexicon Cloud Run Service
resource "google_cloud_run_v2_service" "lexicon" {
  name        = "lexicon"
  location    = "us-central1"
  description = "A Fullstory middleware intended to receive, transform and route behavioural activation instructions."

  template {
    service_account = google_service_account.lexicon_runner.email
    containers {
      name  = "lexicon"
      image = "YOUR_REGISTRY/lexicon:latest" // Replace with your container registry

      // Example environment variables - customize these for your integrations
      // Uncomment and modify the environment variables you need for your specific use case
      
      /*
      // Example: API Keys for external services
      env {
        name = "API_KEY_SERVICE_1"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.api_key_service_1.secret_id
            version = "latest"
          }
        }
      }
      
      // Example: Database connection strings
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      
      // Example: Webhook URLs
      env {
        name = "WEBHOOK_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.webhook_url.secret_id
            version = "latest"
          }
        }
      }
      
      // Example: Third-party service credentials
      env {
        name = "THIRD_PARTY_USERNAME"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.third_party_username.secret_id
            version = "latest"
          }
        }
      }
      
      env {
        name = "THIRD_PARTY_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.third_party_password.secret_id
            version = "latest"
          }
        }
      }
      */
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client
    ]
  }

  depends_on = [
    // google_secret_manager_secret_iam_member.lexicon_runner  // Uncomment when you add secrets
  ]
}

// Lexicon MCP (Model Context Protocol) Server for AI Agent integration
resource "google_cloud_run_v2_service" "lexicon_mcp" {
  name        = "lexicon-mcp"
  location    = "us-central1"
  description = "Lexicon MCP Server for AI Agent integration"

  template {
    service_account = google_service_account.lexicon_runner.email
    containers {
      name  = "lexicon-mcp"
      image = "YOUR_REGISTRY/lexicon-mcp:latest" // Replace with your container registry
      ports {
        container_port = 8080
      }

      // MCP-specific environment variables
      env {
        name  = "MCP_MODE"
        value = "true"
      }
      env {
        name  = "SAFE_MODE"
        value = "true"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      // Same environment variables as main service
      // Add your custom environment variables here following the pattern above
      // This abbreviated version shows the structure - customize for your needs
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client
    ]
  }

  depends_on = [
    // google_secret_manager_secret_iam_member.lexicon_runner  // Uncomment when you add secrets
  ]
}

//============================================================================
// SECRET MANAGER SECRETS
//============================================================================

// Example secrets - customize these for your specific integrations
// Uncomment and modify the secrets you need for your use case

/*
// Example: API Key for external service
resource "google_secret_manager_secret" "api_key_service_1" {
  secret_id = "api-key-service-1"
  replication {
    auto {}
  }
}

// Example: Database connection string
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
  replication {
    auto {}
  }
}

// Example: Webhook URL
resource "google_secret_manager_secret" "webhook_url" {
  secret_id = "webhook-url"
  replication {
    auto {}
  }
}

// Example: Third-party service credentials
resource "google_secret_manager_secret" "third_party_username" {
  secret_id = "third-party-username"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "third_party_password" {
  secret_id = "third-party-password"
  replication {
    auto {}
  }
}
*/

//============================================================================
// IAM BINDINGS FOR SECRETS
//============================================================================

// Grant Secret Manager access to the Lexicon service account
// Uncomment and modify this section when you add your own secrets

/*
resource "google_secret_manager_secret_iam_member" "lexicon_runner" {
  for_each = toset([
    google_secret_manager_secret.api_key_service_1.secret_id,
    google_secret_manager_secret.database_url.secret_id,
    google_secret_manager_secret.webhook_url.secret_id,
    google_secret_manager_secret.third_party_username.secret_id,
    google_secret_manager_secret.third_party_password.secret_id,
    // Add more secrets as needed
  ])
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.lexicon_runner.email}"
}
*/

//============================================================================
// OUTPUTS
//============================================================================

output "lexicon_service_url" {
  description = "URL of the main Lexicon Cloud Run service"
  value       = google_cloud_run_v2_service.lexicon.uri
}

output "lexicon_mcp_service_url" {
  description = "URL of the Lexicon MCP Cloud Run service"
  value       = google_cloud_run_v2_service.lexicon_mcp.uri
}

output "lexicon_service_account_email" {
  description = "Email of the Lexicon service account"
  value       = google_service_account.lexicon_runner.email
}
