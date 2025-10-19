const HUBSPOT_API_BASE = 'https://api.hubapi.com'

// Refresh expired access token
export async function refreshHubSpotToken(refreshToken: string): Promise<string> {
  try {
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        refresh_token: refreshToken
      })
    })
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`)
    }
    
    const data = await response.json() as { access_token: string; refresh_token: string }
    
    return data.access_token
    
  } catch (error) {
    console.error('Error refreshing HubSpot token:', error)
    throw error
  }
}


// Type definitions
interface HubSpotContact {
  hubspot_id: string;
  email: string;
  firstname: string;
  lastname: string;
  phone: string;
  notes: string;
}

interface HubSpotAPIContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    notes?: string;
  };
}

interface HubSpotAPIResponse {
  results: HubSpotAPIContact[];
}

interface CreateContactData {
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
}

export async function getHubSpotClient(accessToken: string) {
  return {
    contacts: {
      list: () => fetchHubSpotContacts(accessToken),
      create: (data: CreateContactData) => 
        createHubSpotContact(accessToken, data),
      addNote: (contactId: string, note: string) => 
        addNoteToContact(accessToken, contactId, note)
    }
  }
}

// Fetch all contacts
async function fetchHubSpotContacts(accessToken: string): Promise<HubSpotContact[]> {
  try {
    const response = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?limit=100&properties=email,firstname,lastname,phone,notes`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('response HUB', response)
    
    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status}`)
    }
    
    const data = await response.json() as HubSpotAPIResponse
    
    // Format the results
    return data.results.map((contact: HubSpotAPIContact) => ({
      hubspot_id: contact.id,
      email: contact.properties.email || '',
      firstname: contact.properties.firstname || '',
      lastname: contact.properties.lastname || '',
      phone: contact.properties.phone || '',
      notes: contact.properties.notes || ''
    }))
    
  } catch (error) {
    console.error('Error fetching HubSpot contacts:', error)
    throw error
  }
}

// Create a new contact
async function createHubSpotContact(
  accessToken: string, 
  data: CreateContactData
) {
  try {
    const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          email: data.email,
          firstname: data.firstname || '',
          lastname: data.lastname || '',
          phone: data.phone || ''
        }
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json() as { message?: string }
      throw new Error(`HubSpot API error: ${errorData.message || response.status}`)
    }
    
    const result = await response.json() as { id: string }
    
    return {
      success: true,
      contactId: result.id,
      contact: result
    }
    
  } catch (error) {
    console.error('Error creating HubSpot contact:', error)
    throw error
  }
}

// Add a note to a contact
async function addNoteToContact(accessToken: string, contactId: string, noteText: string) {
  try {
    // First, create the note
    const noteResponse = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: noteText,
          hs_timestamp: new Date().toISOString()
        }
      })
    })
    
    if (!noteResponse.ok) {
      throw new Error(`Failed to create note: ${noteResponse.status}`)
    }
    
    const note = await noteResponse.json() as { id: string }
    
    // Associate the note with the contact
    const associationResponse = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/notes/${note.id}/associations/contacts/${contactId}/note_to_contact`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )
    
    if (!associationResponse.ok) {
      throw new Error(`Failed to associate note: ${associationResponse.status}`)
    }
    
    return {
      success: true,
      noteId: note.id
    }
    
  } catch (error) {
    console.error('Error adding note to contact:', error)
    throw error
  }
}

// Search for a contact by email
export async function searchContactByEmail(accessToken: string, email: string) {
  try {
    const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: email
          }]
        }],
        properties: ['email', 'firstname', 'lastname', 'phone', 'notes']
      })
    })
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`)
    }
    
    const data = await response.json() as HubSpotAPIResponse
    
    if (data.results && data.results.length > 0) {
      const contact = data.results[0]
      return {
        found: true,
        contact: {
          hubspot_id: contact.id,
          email: contact.properties.email || '',
          firstname: contact.properties.firstname || '',
          lastname: contact.properties.lastname || '',
          phone: contact.properties.phone || '',
          notes: contact.properties.notes || ''
        }
      }
    }
    
    return { found: false, contact: undefined }
    
  } catch (error) {
    console.error('Error searching contact:', error)
    throw error
  }
}