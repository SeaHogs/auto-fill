// ============================================
// AWS SERVICE MOCK FOR AUTOFILL EXTENSION
// ============================================

// Configuration object - Company changes this for production
const SERVICE_CONFIG = {
    // CHANGE THIS TO false WHEN COMPANY HAS AWS ACCESS
    useMockService: true,  // ← Company changes this to false
    
    // Company adds their real endpoints
    apiEndpoint: 'https://api.company.com/autofill',
    apiKey: 'mock-key',  // ← Fixed: removed process.env
    bucketName: 'company-autofill-profiles',
    
    // AWS Configuration (company fills in)
    aws: {
        region: 'us-east-1',
        comprehendEndpoint: null, // Company adds
        sagemakerEndpoint: null,  // Company adds
        personalizeEndpoint: null // Company adds
    }
};
// ============================================
// FIELD MATCHING SERVICE WITH REALISTIC MOCK
// ============================================
class FieldMatchingService {
    constructor(config = {}) {
        // Merge with default config
        this.config = { ...SERVICE_CONFIG, ...config };
        this.useMockService = this.config.useMockService;
        this.apiEndpoint = this.config.apiEndpoint;
        this.apiKey = this.config.apiKey;
        
        // Confidence threshold for accepting matches
        this.confidenceThreshold = 0.7;
        
        console.log(`[AutoFill] AWS Service initialized in ${this.useMockService ? 'MOCK' : 'PRODUCTION'} mode`);
    }

    // Main method that your extension calls
    async matchField(fieldContext) {
        if (this.useMockService) {
            return this.mockMatchField(fieldContext);
        } else {
            return this.realMatchField(fieldContext);
        }
    }

    async enhanceMatching(fieldData, profileData) {
        if (this.useMockService) {
            return this.mockEnhanceMatching(fieldData, profileData);
        } else {
            return this.realEnhanceMatching(fieldData, profileData);
        }
    }

    // ============================================
    // REALISTIC MOCK IMPLEMENTATION
    // ============================================
    async mockMatchField(fieldContext) {
        // Simulate network delay
        await this.simulateNetworkDelay();
        
        // Analyze the field context dynamically
        const analysis = this.analyzeFieldContext(fieldContext);
        
        // Build realistic ML-style response
        const mockResponse = {
            fieldType: analysis.bestMatch,
            confidence: analysis.confidence,
            alternatives: analysis.alternatives,
            metadata: {
                processingTime: Math.round(45 + Math.random() * 30),
                modelVersion: 'mock-v1.0',
                region: this.config.aws.region,
                features: analysis.features,
                method: 'mock'
            }
        };
        
        if (analysis.confidence > 0.5) {
            console.debug(`[AutoFill] Mock AWS predicted: ${mockResponse.fieldType} (${(mockResponse.confidence * 100).toFixed(1)}% confidence)`);
        }
        
        return mockResponse;
    }

    analyzeFieldContext(fieldContext) {
        const text = (fieldContext.combinedText || '').toLowerCase();
        const features = this.extractFeatures(fieldContext);
        
        // Define field patterns with multiple signals
        const fieldPatterns = {
            email: {
                keywords: ['email', 'e-mail', 'mail', 'address', 'contact'],
                patterns: [/@/, /email/i, /e-?mail/i, /address/i],
                typeBonus: fieldContext.type === 'email' ? 0.4 : 0
            },
            phone: {
                keywords: ['phone', 'mobile', 'cell', 'tel', 'telephone', 'number', 'contact'],
                patterns: [/phone/i, /mobile/i, /tel/i, /cell/i, /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/],
                typeBonus: fieldContext.type === 'tel' ? 0.4 : 0
            },
            firstName: {
                keywords: ['first', 'given', 'fname', 'forename', 'prenom', 'name'],
                patterns: [/first\s*name/i, /given\s*name/i, /f\.?\s*name/i, /prenom/i],
                typeBonus: 0
            },
            lastName: {
                keywords: ['last', 'surname', 'family', 'lname', 'nom', 'apellido'],
                patterns: [/last\s*name/i, /surname/i, /family\s*name/i, /l\.?\s*name/i],
                typeBonus: 0
            },
            fullName: {
                keywords: ['full', 'name', 'complete', 'your name', 'nombre'],
                patterns: [/full\s*name/i, /your\s*name/i, /complete\s*name/i, /nombre\s*completo/i],
                typeBonus: 0
            },
            birthday: {
                keywords: ['birth', 'birthday', 'dob', 'born', 'date of birth'],
                patterns: [/birth/i, /dob/i, /date\s*of\s*birth/i],
                typeBonus: fieldContext.type === 'date' ? 0.3 : 0
            },
            address1: {
                keywords: ['address', 'street', 'line 1', 'residence', 'location'],
                patterns: [/street/i, /address/i, /line\s*1/i, /residence/i],
                typeBonus: 0
            },
            city: {
                keywords: ['city', 'town', 'municipality', 'locality', 'ciudad'],
                patterns: [/city/i, /town/i, /municipality/i],
                typeBonus: 0
            },
            postalCode: {
                keywords: ['zip', 'postal', 'postcode', 'code', 'pin'],
                patterns: [/zip/i, /postal\s*code/i, /post\s*code/i, /\d{5}(-\d{4})?/],
                typeBonus: 0
            },
            country: {
                keywords: ['country', 'nation', 'país', 'pays'],
                patterns: [/country/i, /nation/i],
                typeBonus: 0
            },
            university: {
                keywords: ['university', 'college', 'school', 'institution', 'education'],
                patterns: [/university/i, /college/i, /school/i, /institution/i],
                typeBonus: 0
            },
            degree: {
                keywords: ['degree', 'qualification', 'education', 'level', 'diploma'],
                patterns: [/degree/i, /qualification/i, /education\s*level/i],
                typeBonus: 0
            },
            major: {
                keywords: ['major', 'field', 'study', 'specialization', 'program'],
                patterns: [/major/i, /field\s*of\s*study/i, /specialization/i],
                typeBonus: 0
            },
            gpa: {
                keywords: ['gpa', 'grade', 'score', 'cgpa', 'average'],
                patterns: [/gpa/i, /grade\s*point/i, /cgpa/i],
                typeBonus: fieldContext.type === 'number' ? 0.2 : 0
            },
            gradYear: {
                keywords: ['graduation', 'year', 'graduate', 'completion'],
                patterns: [/graduat/i, /year\s*of\s*grad/i, /completion\s*year/i],
                typeBonus: fieldContext.type === 'number' ? 0.2 : 0
            },
            linkedin: {
                keywords: ['linkedin', 'profile'],
                patterns: [/linkedin/i],
                typeBonus: fieldContext.type === 'url' ? 0.3 : 0
            },
            github: {
                keywords: ['github', 'git', 'repository'],
                patterns: [/github/i, /git\s*hub/i],
                typeBonus: fieldContext.type === 'url' ? 0.3 : 0
            },
            website: {
                keywords: ['website', 'site', 'url', 'homepage', 'portfolio'],
                patterns: [/website/i, /portfolio/i, /homepage/i],
                typeBonus: fieldContext.type === 'url' ? 0.3 : 0
            },
            summary: {
                keywords: ['summary', 'bio', 'about', 'description', 'introduce'],
                patterns: [/summary/i, /about/i, /bio/i, /description/i],
                typeBonus: 0
            }
        };
        
        // Calculate scores for each field type
        const scores = {};
        
        for (const [fieldType, config] of Object.entries(fieldPatterns)) {
            let score = 0;
            
            // Keyword matching (simple TF-IDF simulation)
            const keywordMatches = config.keywords.filter(kw => text.includes(kw));
            score += Math.min(keywordMatches.length * 0.15, 0.4); // Cap at 0.4
            
            // Pattern matching (regex)
            const patternMatches = config.patterns.filter(pattern => pattern.test(text));
            score += Math.min(patternMatches.length * 0.25, 0.5); // Cap at 0.5
            
            // Input type bonus
            score += config.typeBonus;
            
            // Feature-based bonuses
            if (features.hasLabel && keywordMatches.length > 0) score += 0.1;
            if (features.hasPlaceholder && patternMatches.length > 0) score += 0.05;
            if (features.isRequired && ['email', 'phone', 'firstName', 'lastName'].includes(fieldType)) {
                score += 0.05;
            }
            
            // Exact match bonus
            if (text === fieldType.toLowerCase()) score += 0.3;
            
            // Length penalty for very short text
            if (text.length < 3) score *= 0.5;
            
            // Normalize to 0-1 range
            scores[fieldType] = Math.min(1, Math.max(0, score));
        }
        
        // Sort by score
        const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        
        // Get best match and alternatives
        const bestMatch = sortedScores[0];
        const alternatives = sortedScores.slice(1, 4)
            .filter(([_, score]) => score > 0.2)
            .map(([fieldType, score]) => ({ 
                fieldType, 
                confidence: score 
            }));
        
        return {
            bestMatch: bestMatch[1] > 0.3 ? bestMatch[0] : 'unknown',
            confidence: bestMatch[1],
            alternatives,
            features,
            allScores: scores
        };
    }

    async mockEnhanceMatching(fieldData, profileData) {
        await this.simulateNetworkDelay();
        
        // Build recommendations based on actual profile
        const recommendations = [];
        
        if (!profileData || typeof profileData !== 'object') {
            return {
                recommendations: [],
                userPatterns: {
                    commonFields: [],
                    fillRate: 0
                }
            };
        }
        
        // Analyze each field in the profile
        for (const [fieldKey, fieldValue] of Object.entries(profileData)) {
            if (!fieldValue || typeof fieldValue === 'object') continue;
            
            // Calculate relevance score
            let score = 0.4; // Base score
            
            // Boost common/important fields
            const importantFields = ['email', 'firstName', 'lastName', 'phone', 'fullName'];
            if (importantFields.includes(fieldKey)) {
                score += 0.3;
            }
            
            // Boost if field has content
            if (String(fieldValue).length > 2) score += 0.1;
            if (String(fieldValue).length > 10) score += 0.1;
            
            // Add some variance to simulate ML uncertainty
            score += (Math.random() - 0.5) * 0.15;
            
            // Clamp to valid range
            score = Math.max(0.1, Math.min(1, score));
            
            recommendations.push({ fieldKey, score });
        }
        
        // Sort by score
        recommendations.sort((a, b) => b.score - a.score);
        
        // Calculate statistics
        const filledFields = Object.values(profileData).filter(v => v && String(v).length > 0).length;
        const totalFields = Object.keys(profileData).length;
        const fillRate = totalFields > 0 ? filledFields / totalFields : 0;
        
        return {
            recommendations: recommendations.slice(0, 10),
            userPatterns: {
                commonFields: recommendations.slice(0, 5).map(r => r.fieldKey),
                fillRate: fillRate,
                profileCompleteness: fillRate,
                totalFields: totalFields,
                filledFields: filledFields
            }
        };
    }

    extractFeatures(fieldContext) {
        return {
            hasLabel: !!(fieldContext.label && fieldContext.label.length > 0),
            hasPlaceholder: !!(fieldContext.placeholder && fieldContext.placeholder.length > 0),
            hasAriaLabel: !!(fieldContext.ariaLabel && fieldContext.ariaLabel.length > 0),
            isRequired: fieldContext.required || false,
            inputType: fieldContext.type || 'text',
            textLength: (fieldContext.combinedText || '').length,
            wordCount: (fieldContext.combinedText || '').split(/\s+/).filter(w => w).length
        };
    }

    simulateNetworkDelay() {
        const latency = 100 + Math.random() * 200; // 100-300ms
        return new Promise(resolve => setTimeout(resolve, latency));
    }

    // ============================================
    // REAL AWS IMPLEMENTATION (Company adds this)
    // ============================================
    async realMatchField(fieldContext) {
        try {
            // const response = await fetch(`${this.apiEndpoint}/classify`, {
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json',
            //         'X-API-Key': this.apiKey
            //     },
            //     body: JSON.stringify({
            //         text: fieldContext.combinedText,
            //         features: {
            //             label: fieldContext.label,
            //             placeholder: fieldContext.placeholder,
            //             type: fieldContext.type,
            //             name: fieldContext.name,
            //             id: fieldContext.id
            //         },
            //         service: 'comprehend'
            //     })
            // });

            // if (!response.ok) {
            //     throw new Error(`AWS API error: ${response.status}`);
            // }

            // const data = await response.json();
            // return {
            //     fieldType: data.fieldType || data.predictions[0].label,
            //     confidence: data.confidence || data.predictions[0].score,
            //     alternatives: data.alternatives || data.predictions.slice(1),
            //     metadata: { ...data.metadata, method: 'aws' }
            // };
            dynamicMatcher = new DynamicFieldMatcher()
            
        } catch (error) {
            console.error('[AutoFill] AWS API Error:', error);
            console.log('[AutoFill] Falling back to mock service');
            return this.mockMatchField(fieldContext);
        }
    }

    async realEnhanceMatching(fieldData, profileData) {
        try {
            const response = await fetch(`${this.apiEndpoint}/enhance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                },
                body: JSON.stringify({
                    fieldData,
                    profileData,
                    userId: await this.getUserId()
                })
            });

            if (!response.ok) {
                throw new Error(`AWS API error: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.error('[AutoFill] AWS Enhance Error:', error);
            return this.mockEnhanceMatching(fieldData, profileData);
        }
    }

    async getUserId() {
        const storage = await chrome.storage.local.get(['userId']);
        if (!storage.userId) {
            const newId = 'user_' + Math.random().toString(36).substr(2, 9);
            await chrome.storage.local.set({ userId: newId });
            return newId;
        }
        return storage.userId;
    }
}

// ============================================
// STORAGE SERVICE (S3 SIMULATION)
// ============================================
class StorageService {
    constructor(config = {}) {
        this.config = { ...SERVICE_CONFIG, ...config };
        this.useMockService = this.config.useMockService;
        this.bucketName = this.config.bucketName;
    }

    async saveProfile(profileData) {
        if (this.useMockService) {
            return this.mockSaveProfile(profileData);
        } else {
            return this.realSaveProfile(profileData);
        }
    }

    async loadProfile(userId) {
        if (this.useMockService) {
            return this.mockLoadProfile(userId);
        } else {
            return this.realLoadProfile(userId);
        }
    }

    // Mock S3 using Chrome storage
    async mockSaveProfile(profileData) {
        console.debug('[AutoFill] Mock S3: Saving profile locally');
        const timestamp = new Date().toISOString();
        const userId = await this.getUserId();
        
        const mockS3Response = {
            bucket: this.bucketName,
            key: `profiles/${userId}.json`,
            versionId: 'mock-' + Math.random().toString(36).substr(2, 9),
            timestamp: timestamp,
            size: JSON.stringify(profileData).length,
            etag: '"' + Math.random().toString(36).substr(2, 16) + '"'
        };
        
        await chrome.storage.local.set({ 
            mockS3Profile: profileData,
            mockS3Metadata: mockS3Response
        });
        
        return mockS3Response;
    }

    async mockLoadProfile(userId) {
        console.debug('[AutoFill] Mock S3: Loading profile from local storage');
        const storage = await chrome.storage.local.get(['mockS3Profile', 'mockS3Metadata']);
        
        if (storage.mockS3Profile) {
            return {
                data: storage.mockS3Profile,
                metadata: storage.mockS3Metadata
            };
        }
        
        return null;
    }

    // Real S3 implementation (company adds)
    async realSaveProfile(profileData) {
        const response = await fetch(`${this.config.apiEndpoint}/storage/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await this.getAuthToken()}`
            },
            body: JSON.stringify({
                bucket: this.bucketName,
                key: `profiles/${await this.getUserId()}.json`,
                data: profileData
            })
        });
        
        if (!response.ok) {
            throw new Error(`Storage save failed: ${response.status}`);
        }
        
        return await response.json();
    }

    async realLoadProfile(userId) {
        const response = await fetch(`${this.config.apiEndpoint}/storage/load/${userId}`, {
            headers: {
                'Authorization': `Bearer ${await this.getAuthToken()}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`Storage load failed: ${response.status}`);
        }
        
        return await response.json();
    }

    async getAuthToken() {
        // Company implements their auth logic here
        return this.config.apiKey || 'COMPANY_AUTH_TOKEN';
    }

    async getUserId() {
        const storage = await chrome.storage.local.get(['userId']);
        if (!storage.userId) {
            const newId = 'user_' + Math.random().toString(36).substr(2, 9);
            await chrome.storage.local.set({ userId: newId });
            return newId;
        }
        return storage.userId;
    }
}

class EnhancedStorageService extends StorageService {
    async mockLoadProfile(userId) {
        console.log(`[AutoFill] Mock AWS: Fetching profile for ${userId}`);
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Mock company database
        const companyDatabase = {
            'mock-user-123': {
                // Basic Information
                firstName: 'John',
                lastName: 'Doe',
                fullName: 'John Doe',
                email: 'john.doe@company.com',
                phone: '+1-555-0123',
                birthday: '1990-01-15',
                
                // Address
                address1: '123 Tech Street',
                city: 'San Francisco',
                postalCode: '94105',
                country: 'United States',
                
                // Education
                university: 'Stanford University',
                degree: 'Bachelor of Science',
                major: 'Computer Science',
                gpa: '3.8',
                gradYear: '2012',
                
                // Professional
                linkedin: 'https://linkedin.com/in/johndoe',
                github: 'https://github.com/johndoe',
                website: 'https://johndoe.dev',
                summary: 'Senior Software Engineer with expertise in cloud architecture and machine learning.',
                
                // Company-specific fields (optional)
                employeeId: 'EMP-12345',
                department: 'Engineering',
                title: 'Senior Software Engineer'
            },
            'default': {
                firstName: 'Demo',
                lastName: 'User',
                fullName: 'Demo User',
                email: 'demo@example.com',
                phone: '+1-555-0000',
                birthday: '1995-06-15',
                address1: '456 Demo Lane',
                city: 'New York',
                postalCode: '10001',
                country: 'United States',
                university: 'MIT',
                degree: 'Master of Science',
                major: 'Artificial Intelligence',
                gpa: '3.9',
                gradYear: '2017',
                linkedin: 'https://linkedin.com/in/demouser',
                github: 'https://github.com/demouser',
                website: 'https://demo.example.com',
                summary: 'AI researcher and software developer.'
            }
        };
        
        // Return user data or default
        const userData = companyDatabase[userId] || companyDatabase['default'];
        
        return {
            data: userData,
            metadata: {
                source: 'mock-aws',
                userId: userId,
                lastModified: new Date().toISOString(),
                department: userData.department || 'General'
            }
        };
    }
    
    async mockSaveProfile(profileData) {
        console.log('[AutoFill] Mock AWS: Saving profile to cloud');
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // In reality, this would save to AWS
        // For mock, we just save locally with a flag
        await chrome.storage.local.set({
            af_profile_cloud_backup: profileData,
            af_profile_cloud_timestamp: Date.now()
        });
        
        return {
            success: true,
            timestamp: new Date().toISOString(),
            message: 'Profile saved to mock cloud storage'
        };
    }
}

// ============================================
// EXPORT FOR USE IN CONTENT.JS
// ============================================
console.log('[AutoFill] AWS Service Module Loaded');

// Make services available globally for the extension
window.FieldMatchingService = FieldMatchingService;
window.StorageService = StorageService;
window.SERVICE_CONFIG = SERVICE_CONFIG;